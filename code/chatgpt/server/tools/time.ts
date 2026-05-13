import { z } from "zod";
import type { ToolDefinition } from "../agent/types";

const timeArgsSchema = z.object({
  timezone: z
    .string()
    .min(1, "时区不能为空")
    .describe("IANA 时区，例如 Asia/Shanghai、America/New_York"),
});

type TimeArgs = z.infer<typeof timeArgsSchema>;

export const timeTool = {
  name: "get_current_time",
  description: "当用户要查询某个城市或时区的当前日期、时间、星期时使用。",
  inputSchema: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "IANA 时区，例如 Asia/Shanghai、America/New_York",
      },
    },
    required: ["timezone"],
    additionalProperties: false,
  },
  argsSchema: timeArgsSchema,
  async execute(args) {
    const now = new Date();

    try {
      const formatter = new Intl.DateTimeFormat("zh-CN", {
        timeZone: args.timezone,
        dateStyle: "full",
        timeStyle: "medium",
      });

      return {
        timezone: args.timezone,
        isoTime: now.toISOString(),
        localTime: formatter.format(now),
      };
    } catch {
      throw new Error(`无效时区：${args.timezone}`);
    }
  },
} satisfies ToolDefinition<TimeArgs, unknown>;
