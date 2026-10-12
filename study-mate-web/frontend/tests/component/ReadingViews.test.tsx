/* LessonView / HomeEmbed 的阅读入口：一律走导出应用（reading 接口 / 全工作区导出）。 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getReadingMock, listLessonsMock } = vi.hoisted(() => ({
  getReadingMock: vi.fn(),
  listLessonsMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("subject=demo&node=intro"),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getReading: getReadingMock,
      listLessons: listLessonsMock,
    },
  };
});
vi.mock("@/lib/workspace", async () => ({
  useWorkspace: () => ({ activeWorkspace: null }),
}));

import { LessonView } from "@/components/LessonView";
import { HomeEmbed } from "@/components/HomeEmbed";

const LESSONS = {
  lessons: [
    {
      seq: 1,
      node_id: "intro",
      file: "lessons/0001-intro.md",
      title: "测试课",
      kind: "概念",
      status: "未开始",
      has_quiz: true,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  listLessonsMock.mockResolvedValue(LESSONS);
});

describe("LessonView 阅读入口", () => {
  it("iframe 指向 reading 返回的导出应用入口", async () => {
    getReadingMock.mockResolvedValue({
      url: "/api/exports/demo/index.html",
      entry: "C:/x/index.html",
      fresh: false,
      engine: "node",
    });
    render(<LessonView />);
    await waitFor(() => {
      expect(screen.getByTitle("测试课")).toHaveAttribute("src", "/api/exports/demo/index.html");
    });
    expect(getReadingMock).toHaveBeenCalledWith("demo", null);
  });

  it("reading 失败显示错误态", async () => {
    getReadingMock.mockRejectedValue(new Error("导出失败"));
    render(<LessonView />);
    await waitFor(() => {
      expect(screen.getByText("导出失败")).toBeTruthy();
    });
  });
});

describe("HomeEmbed", () => {
  it("指向全工作区导出入口", () => {
    render(<HomeEmbed />);
    expect(screen.getByTestId("home-embed")).toHaveAttribute(
      "src",
      "/api/exports/_home/index.html",
    );
  });
});
