import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DirectoryBrowseDialog } from "@/components/DirectoryBrowseDialog";
import type { FsDirsInfo } from "@/lib/types";

// 目录浏览弹窗：服务端只列一级子目录（GET /api/fs/dirs）。选定只是回调路径（会话级绑定），
// 组件自身不做任何写操作。
const { listDirs } = vi.hoisted(() => ({ listDirs: vi.fn() }));

vi.mock("@/lib/api", () => ({
  api: { listDirs },
}));

const ROOT: FsDirsInfo = { path: "C:\\root", dirs: ["alpha", "beta"], truncated: false };
const ALPHA: FsDirsInfo = { path: "C:\\root\\alpha", dirs: ["inner"], truncated: false };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DirectoryBrowseDialog", () => {
  it("打开后列出根目录，点目录行进入子目录，可返回上一级", async () => {
    listDirs.mockImplementation(async (path?: string | null) => {
      if (!path || path === "C:\\root") return ROOT;
      if (path === "C:\\root\\alpha") return ALPHA;
      throw new Error("404");
    });

    render(<DirectoryBrowseDialog open onClose={vi.fn()} onSelect={vi.fn()} />);

    await screen.findByText("alpha");
    expect(listDirs).toHaveBeenCalledWith(null);
    expect(screen.getByTestId("dir-current-path")).toHaveTextContent("C:\\root");
    expect(screen.queryByTestId("dir-back")).not.toBeInTheDocument();

    // 点行进入子目录：重拉并以当前路径展示
    await userEvent.click(screen.getByText("alpha"));
    expect(listDirs).toHaveBeenCalledWith("C:\\root\\alpha");
    await screen.findByText("inner");
    expect(screen.getByTestId("dir-current-path")).toHaveTextContent("C:\\root\\alpha");
    expect(screen.getByTestId("dir-back")).toBeInTheDocument();

    // 返回上一级回到根
    await userEvent.click(screen.getByTestId("dir-back"));
    await screen.findByText("beta");
    expect(screen.getByTestId("dir-current-path")).toHaveTextContent("C:\\root");
    expect(screen.queryByTestId("dir-back")).not.toBeInTheDocument();
  });

  it("点某行的「选择」按钮回调该行目录的完整路径", async () => {
    listDirs.mockResolvedValue(ROOT);
    const onSelect = vi.fn();
    render(<DirectoryBrowseDialog open onClose={vi.fn()} onSelect={onSelect} />);

    await screen.findByText("beta");
    const row = screen
      .getAllByTestId("dir-row")
      .find((el) => el.getAttribute("data-path") === "C:\\root\\beta");
    expect(row).toBeDefined();
    await userEvent.click(within(row as HTMLElement).getByTestId("dir-pick"));

    expect(onSelect).toHaveBeenCalledWith("C:\\root\\beta");
  });

  it("读取失败显示错误与重试，重试再次请求", async () => {
    listDirs.mockRejectedValue(new Error("404 not found"));
    render(<DirectoryBrowseDialog open onClose={vi.fn()} onSelect={vi.fn()} />);

    await screen.findByText(/读取目录失败/);
    expect(screen.getByText(/404 not found/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(listDirs.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("truncated 时提示仅显示前 N 个", async () => {
    listDirs.mockResolvedValue({ path: "C:\\root", dirs: ["a", "b"], truncated: true });
    render(<DirectoryBrowseDialog open onClose={vi.fn()} onSelect={vi.fn()} />);

    await screen.findByText(/子目录过多，仅显示前 2 个/);
  });

  it("open 为 false 时不渲染", () => {
    render(<DirectoryBrowseDialog open={false} onClose={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.queryByTestId("directory-browse-dialog")).not.toBeInTheDocument();
    expect(listDirs).not.toHaveBeenCalled();
  });
});
