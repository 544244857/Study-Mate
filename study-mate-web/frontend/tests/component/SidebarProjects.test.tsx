import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/Sidebar";
import type { SessionMeta, SubjectMeta } from "@/lib/types";

// 「项目」分组：顶层「会话」只显示未绑定工作区的会话；绑定过的按规整路径分组，
// 组名 = basename、组头带删除 / + 新会话；同名不同父目录不合并。
const { push, replace, workspace, bulkDeleteSessions } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  workspace: { current: {} as Record<string, unknown> },
  bulkDeleteSessions: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/chat",
}));

vi.mock("@/lib/workspace", () => ({
  useWorkspace: () => workspace.current,
}));

vi.mock("@/lib/api", () => ({
  api: { bulkDeleteSessions },
}));

function makeSession(id: string, i: number, workspace: string | null = null): SessionMeta {
  return {
    id,
    title: `会话${i}`,
    message_count: 1,
    created_at: i,
    updated_at: i,
    subject_slug: null,
    node_id: null,
    mode: "chat",
    workspace,
    usage: null,
    active: null,
  };
}

function setWorkspace(over: Record<string, unknown> = {}) {
  workspace.current = {
    sessions: [] as SessionMeta[],
    subjects: [] as SubjectMeta[],
    subjectsLoaded: true,
    activeSessionId: null,
    currentSubjectSlug: null,
    setCurrentSubjectSlug: vi.fn(),
    setActiveSessionId: vi.fn(),
    setActiveNodeId: vi.fn(),
    refreshSessions: vi.fn().mockResolvedValue(undefined),
    newSession: vi.fn(),
    openSession: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
    createSubject: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("侧栏「项目」分组", () => {
  it("默认组只显示未绑定会话；绑定会话归入项目组（带 data-workspace）", () => {
    setWorkspace({
      sessions: [
        makeSession("u1", 1, null),
        makeSession("p1", 2, "C:\\ws\\proj-x"),
      ],
    });
    render(<Sidebar />);

    // 顶层只渲染未绑定会话，且不在任何项目组里
    expect(screen.getByText("会话1")).toBeInTheDocument();
    const groups = screen.getAllByTestId("project-group");
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveAttribute("data-workspace", "C:\\ws\\proj-x");
    expect(within(groups[0]).getByText("会话2")).toBeInTheDocument();
    expect(within(groups[0]).queryByText("会话1")).not.toBeInTheDocument();
    // 组名是 basename
    expect(within(groups[0]).getByText("proj-x")).toBeInTheDocument();
  });

  it("同 basename 不同父目录各成一组、不合并", () => {
    setWorkspace({
      sessions: [
        makeSession("a", 1, "C:\\ws\\a\\proj-x"),
        makeSession("b", 2, "D:\\ws\\b\\proj-x"),
      ],
    });
    render(<Sidebar />);

    const groups = screen.getAllByTestId("project-group");
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.getAttribute("data-workspace"))).toEqual([
      "C:\\ws\\a\\proj-x",
      "D:\\ws\\b\\proj-x",
    ]);
    // 两个组名都是 proj-x，但 hover（title）各自显示完整路径
    expect(within(groups[0]).getByTitle("C:\\ws\\a\\proj-x")).toBeInTheDocument();
    expect(within(groups[1]).getByTitle("D:\\ws\\b\\proj-x")).toBeInTheDocument();
  });

  it("大小写 / 分隔符差异视为同一工作区，合并为一组", () => {
    setWorkspace({
      sessions: [
        makeSession("a", 1, "C:\\WS\\Proj"),
        makeSession("b", 2, "c:/ws/proj"),
      ],
    });
    render(<Sidebar />);

    const groups = screen.getAllByTestId("project-group");
    expect(groups).toHaveLength(1);
    expect(within(groups[0]).getByText("会话1")).toBeInTheDocument();
    expect(within(groups[0]).getByText("会话2")).toBeInTheDocument();
  });

  it("project-delete：确认后按路径批量删除并刷新；含活动会话时清掉活动态", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    bulkDeleteSessions.mockResolvedValue({ ok: true, deleted: 1 });
    const setActiveSessionId = vi.fn();
    const setActiveNodeId = vi.fn();
    const refreshSessions = vi.fn().mockResolvedValue(undefined);
    setWorkspace({
      sessions: [
        makeSession("u1", 1, null),
        makeSession("p1", 2, "C:\\ws\\proj-x"),
      ],
      activeSessionId: "p1",
      setActiveSessionId,
      setActiveNodeId,
      refreshSessions,
    });
    render(<Sidebar />);

    await userEvent.click(screen.getByTestId("project-delete"));

    const text = String(confirmSpy.mock.calls[0]?.[0] ?? "");
    expect(text).toContain("删除项目「proj-x」");
    expect(text).toContain("1 条会话");
    expect(bulkDeleteSessions).toHaveBeenCalledWith("C:\\ws\\proj-x");
    expect(refreshSessions).toHaveBeenCalled();
    expect(setActiveSessionId).toHaveBeenCalledWith(null);
    expect(setActiveNodeId).toHaveBeenCalledWith(null);
  });

  it("project-delete：取消时不调删除接口", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    setWorkspace({ sessions: [makeSession("p1", 1, "C:\\ws\\proj-x")] });
    render(<Sidebar />);

    await userEvent.click(screen.getByTestId("project-delete"));
    expect(bulkDeleteSessions).not.toHaveBeenCalled();
  });

  it("project-new-session：以项目路径开新会话并跳 /chat", async () => {
    const newSession = vi.fn();
    setWorkspace({
      sessions: [makeSession("p1", 1, "C:\\ws\\proj-x")],
      newSession,
    });
    render(<Sidebar />);

    await userEvent.click(screen.getByTestId("project-new-session"));
    expect(newSession).toHaveBeenCalledWith("C:\\ws\\proj-x");
    expect(push).toHaveBeenCalledWith("/chat");
  });
});
