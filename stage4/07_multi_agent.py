#!/usr/bin/env python3
# Multi-Agent：多个 Agent 协作完成复杂任务
"""
07_multi_agent.py - Multi-Agent 系统
演示四种 Multi-Agent 架构模式：

1. 串行模式（Pipeline）    → 上一个的输出是下一个的输入
2. 路由模式（Router）      → 根据意图分发到不同专业 Agent
3. 协作模式（Collaborative）→ 协调者管理多个 Agent 协同工作
4. 辩论模式（Debate）      → 正反方辩论 + 裁判总结

核心思路：
  单 Agent：一个人包揽所有事 → Prompt 长、容易混乱
  Multi-Agent：分工明确，各司其职 → 每个 Agent 的 Prompt 短而聚焦

运行方式：
  python3 stage4/07_multi_agent.py

依赖：
  pip install anthropic python-dotenv
"""

import os
import json
from pathlib import Path

try:
    import readline
    readline.parse_and_bind('set bind-tty-special-chars off')
    readline.parse_and_bind('set input-meta on')
    readline.parse_and_bind('set output-meta on')
    readline.parse_and_bind('set convert-meta off')
    readline.parse_and_bind('set enable-meta-keybindings on')
except ImportError:
    pass

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv(override=True)
if os.getenv("ANTHROPIC_BASE_URL"):
    os.environ.pop("ANTHROPIC_AUTH_TOKEN", None)

client = Anthropic(base_url=os.getenv("ANTHROPIC_BASE_URL"))
MODEL = os.environ["MODEL_ID"]


# ===================================================================
# 基础 Agent 类
# ===================================================================

def log(tag: str, msg: str) -> None:
    """带颜色的日志输出"""
    colors = {
        "Agent": "\033[34m",    # 蓝色
        "路由": "\033[36m",     # 青色
        "结果": "\033[32m",     # 绿色
        "总结": "\033[35m",     # 紫色
        "系统": "\033[33m",     # 黄色
    }
    c = colors.get(tag, "\033[0m")
    print(f"{c}[{tag}] {msg}\033[0m")


class Agent:
    """基础 Agent：有独立角色和 System Prompt 的 LLM 调用单元。

    每个 Agent 就是一个"角色"，有自己专属的 System Prompt。
    核心思想：让 LLM 聚焦在一个角色上，比让一个 LLM 扮演多个角色效果好。
    """

    def __init__(self, name: str, system_prompt: str):
        self.name = name
        self.system_prompt = system_prompt

    def run(self, user_input: str) -> str:
        """执行一次 Agent 调用"""
        log("Agent", f"[{self.name}] 开始处理 | 输入长度={len(user_input)} 字符")

        response = client.messages.create(
            model=MODEL,
            system=self.system_prompt,
            messages=[{"role": "user", "content": user_input}],
            max_tokens=4000,
        )

        text = response.content[0].text
        log("Agent", f"[{self.name}] 完成 | 输出长度={len(text)} 字符")
        return text


# ===================================================================
# 模式 1：串行模式（Pipeline）
# ===================================================================
# 用户输入 → [Agent A] → [Agent B] → [Agent C] → 最终输出
#
# 特点：简单直观，前一个的输出是后一个的输入
# 适用：线性流程，如：调研 → 写作 → 审核

def demo_pipeline():
    """串行模式演示：调研 → 写作 → 审核"""
    print("\033[1;34m\n═══════════════════════════════════════")
    print("  模式 1：串行模式（Pipeline）")
    print("  流程：[调研员] → [写作者] → [审核员]")
    print("═══════════════════════════════════════\033[0m\n")

    researcher = Agent(
        name="调研员",
        system_prompt="你是一个信息调研专家。用中文回答。根据用户给出的主题，列出3-5个关键发现，每条简洁明了。不要废话。"
    )
    writer = Agent(
        name="写作者",
        system_prompt="你是一个技术写作者。用中文回答。根据提供的调研结果，写一段流畅的总结（200字以内）。只输出总结内容。"
    )
    reviewer = Agent(
        name="审核员",
        system_prompt="你是一个内容审核员。用中文回答。检查给定内容是否有明显错误或遗漏，给出通过/需修改的评价。如果需修改，给出修改建议。格式：评价：通过/需修改\n理由：...\n修改后内容：...（仅当需修改时）"
    )

    # 第 1 步：调研
    topic = "2025年AI编程工具的发展趋势"
    log("系统", f"第1步：调研员收集关于「{topic}」的信息")
    research = researcher.run(f"请调研以下主题，列出关键发现：{topic}")
    print(f"\033[34m--- 调研结果 ---\033[0m\n{research}\n")

    # 第 2 步：写作
    log("系统", "第2步：写作者根据调研结果撰写总结")
    draft = writer.run(f"根据以下调研结果，写一段简洁的总结：\n\n{research}")
    print(f"\033[34m--- 初稿 ---\033[0m\n{draft}\n")

    # 第 3 步：审核
    log("系统", "第3步：审核员检查内容")
    review = reviewer.run(f"请审核以下内容：\n\n{draft}")
    print(f"\033[34m--- 审核结果 ---\033[0m\n{review}\n")

    return review


# ===================================================================
# 模式 2：路由模式（Router）
# ===================================================================
# 用户输入 → [路由 Agent] → 意图分析 → 分发到专业 Agent
#                                   ├→ [客服 Agent]
#                                   ├→ [技术 Agent]
#                                   └→ [销售 Agent]
#
# 特点：一个入口，按类型分流
# 适用：客服系统、智能助手、多领域问答

# 专业 Agent 定义
SPECIALIST_AGENTS = {
    "客服": Agent(
        name="客服专员",
        system_prompt="你是客服专员，负责处理退款、投诉、售后等问题。用中文回答。给出具体解决方案。态度友好专业。"
    ),
    "技术": Agent(
        name="技术支持",
        system_prompt="你是技术支持工程师，负责解决技术问题、Bug、使用帮助。用中文回答。给出清晰的步骤说明。"
    ),
    "销售": Agent(
        name="销售顾问",
        system_prompt="你是销售顾问，负责回答价格、购买、合作等问题。用中文回答。了解客户需求并推荐合适的方案。"
    ),
}

# 意图分类映射
INTENT_MAP = {
    "退款": "客服", "投诉": "客服", "售后": "客服", "退货": "客服", "客服": "客服",
    "技术": "技术", "Bug": "技术", "bug": "技术", "报错": "技术", "报错": "技术",
    "错误": "技术", "使用": "技术", "安装": "技术", "配置": "技术",
    "价格": "销售", "购买": "销售", "合作": "销售", "优惠": "销售", "销售": "销售",
    "多少钱": "销售", "收费": "销售",
}


def route_intent(user_input: str) -> str:
    """路由函数：分析用户意图，返回专业 Agent 类别"""
    log("路由", f"分析意图：{user_input[:50]}...")

    response = client.messages.create(
        model=MODEL,
        system="你是一个意图分类器。分析用户输入，只返回一个类别：客服、技术、销售。不要返回任何其他内容。",
        messages=[{"role": "user", "content": f"分析以下输入属于哪个类别（客服/技术/销售）：\n{user_input}"}],
        max_tokens=20,
    )

    intent = response.content[0].text.strip()
    # 简单的匹配逻辑
    for keyword, category in INTENT_MAP.items():
        if keyword in intent:
            intent = category
            break

    log("路由", f"意图分类结果：{intent}")
    return intent


def demo_router():
    """路由模式演示：意图识别 → 分发到专业 Agent"""
    print("\033[1;36m\n═══════════════════════════════════════")
    print("  模式 2：路由模式（Router）")
    print("  流程：用户输入 → 意图分析 → 分发到专业 Agent")
    print("═══════════════════════════════════════\033[0m\n")

    # 演示三个不同类型的问题
    test_inputs = [
        "我买的东西想退货，已经过了7天了还能退吗？",
        "程序启动时报错 ModuleNotFoundError，怎么解决？",
        "你们的企业版多少钱一年？有什么优惠？",
    ]

    for user_input in test_inputs:
        log("系统", f"用户输入：{user_input}")
        intent = route_intent(user_input)
        specialist = SPECIALIST_AGENTS.get(intent, SPECIALIST_AGENTS["客服"])
        result = specialist.run(user_input)
        print(f"\033[36m--- [{specialist.name} 的回复] ---\033[0m\n{result}\n")
        print("-" * 40)


# ===================================================================
# 模式 3：协作模式（Collaborative）
# ===================================================================
#       ┌→ [搜索员] → 搜索结果 ─┐
# 用户 → [协调者] ──────────────→ [写作者] → 最终报告
#       └→ [分析师] → 分析结论 ─┘
#
# 特点：一个协调者管理多个专业 Agent，并行或串行调度
# 适用：研究报告、复杂分析、项目调研

class ResearchTeam:
    """协作模式：研究团队

    协调者负责拆解任务，分派给专业 Agent，最后汇总结果。
    每个 Agent 独立运行，各自有专属的 System Prompt。
    """

    def __init__(self):
        self.coordinator = Agent(
            name="协调者",
            system_prompt="你是项目协调者。用中文回答。根据用户的研究主题，制定研究计划：列出3个具体的研究方向。用编号列表输出，每条一行。"
        )
        self.researcher = Agent(
            name="搜索员",
            system_prompt="你是信息搜索专家。用中文回答。针对给定的研究方向，给出你了解到的关键信息和数据。列出3-5个要点。"
        )
        self.analyst = Agent(
            name="分析师",
            system_prompt="你是数据分析师。用中文回答。对提供的调研数据进行分析，总结趋势、机会和风险。分点说明。"
        )
        self.writer = Agent(
            name="写作者",
            system_prompt="你是技术写作者。用中文回答。根据提供的调研和分析，写一份简洁的研究摘要（300字以内），包含：背景、关键发现、趋势分析、建议。"
        )

    def run(self, topic: str) -> str:
        """执行完整的研究流程"""
        log("系统", f"研究团队开始处理：{topic}")

        # Step 1：协调者拆解任务
        log("系统", "Step 1/4：协调者拆解研究方向")
        plan = self.coordinator.run(f"请为以下主题制定研究计划：{topic}")
        print(f"\033[34m--- 研究计划 ---\033[0m\n{plan}\n")

        # Step 2：搜索员针对每个方向收集信息
        log("系统", "Step 2/4：搜索员收集信息")
        research_inputs = [f"研究方向：{topic}\n请针对以下方向收集信息：\n{plan}"]
        all_research = []
        for inp in research_inputs:
            result = self.researcher.run(inp)
            all_research.append(result)
        research_text = "\n\n".join(all_research)
        print(f"\033[34m--- 调研结果 ---\033[0m\n{research_text[:500]}...\n")

        # Step 3：分析师分析
        log("系统", "Step 3/4：分析师分析趋势")
        analysis = self.analyst.run(
            f"研究主题：{topic}\n\n调研数据：\n{research_text}\n\n请分析趋势和关键发现。"
        )
        print(f"\033[34m--- 分析结论 ---\033[0m\n{analysis}\n")

        # Step 4：写作者汇总报告
        log("系统", "Step 4/4：写作者汇总最终报告")
        report = self.writer.run(
            f"研究主题：{topic}\n\n调研数据：\n{research_text}\n\n分析结论：\n{analysis}\n\n请写一份简洁的研究摘要。"
        )
        print(f"\033[34m--- 最终报告 ---\033[0m\n{report}\n")

        return report


def demo_collaborative():
    """协作模式演示"""
    print("\033[1;35m\n═══════════════════════════════════════")
    print("  模式 3：协作模式（Collaborative）")
    print("  流程：协调者 → 搜索员 → 分析师 → 写作者")
    print("═══════════════════════════════════════\033[0m\n")

    team = ResearchTeam()
    topic = "AI Agent 在企业中的应用现状"
    team.run(topic)


# ===================================================================
# 模式 4：辩论模式（Debate）
# ===================================================================
# [正方 Agent] ⇄ [反方 Agent] → [裁判 Agent] → 最终结论
#
# 特点：通过正反方多轮辩论，得到更全面客观的结论
# 适用：决策分析、方案评估、风险评估

class DebateSystem:
    """辩论系统：正方 vs 反方，裁判总结

    通过让两个 Agent 分别扮演正方和反方，
    经过几轮辩论后由裁判综合给出结论。
    """

    def __init__(self):
        self.proposer = Agent(
            name="正方",
            system_prompt="你是辩论正方。用中文回答。你的职责是支持给定的观点，提出有力的论据和数据。每次发言控制在200字以内。"
        )
        self.opponent = Agent(
            name="反方",
            system_prompt="你是辩论反方。用中文回答。你的职责是反驳对方的观点，指出漏洞和风险。每次发言控制在200字以内。"
        )
        self.judge = Agent(
            name="裁判",
            system_prompt="你是辩论裁判。用中文回答。综合正反双方的观点，给出客观公正的最终结论。包含：正方合理之处、反方合理之处、最终建议。"
        )

    def run(self, topic: str, rounds: int = 2) -> str:
        """执行辩论"""
        log("系统", f"辩论开始，辩题：{topic}，共 {rounds} 轮")

        debate_history = []

        for i in range(rounds):
            # 正方发言
            log("系统", f"第 {i+1}/{rounds} 轮：正方发言")
            pro = self.proposer.run(
                f"辩题：{topic}\n"
                f"辩论历史：\n{format_history(debate_history)}\n"
                f"请提出你的论点。"
            )
            debate_history.append(("正方", pro))
            print(f"\033[32m--- 正方第{i+1}轮 ---\033[0m\n{pro}\n")

            # 反方反驳
            log("系统", f"第 {i+1}/{rounds} 轮：反方反驳")
            con = self.opponent.run(
                f"辩题：{topic}\n"
                f"辩论历史：\n{format_history(debate_history)}\n"
                f"请反驳对方观点。"
            )
            debate_history.append(("反方", con))
            print(f"\033[31m--- 反方第{i+1}轮 ---\033[0m\n{con}\n")

        # 裁判总结
        log("系统", "裁判进行最终评判")
        full_history = format_history(debate_history)
        verdict = self.judge.run(
            f"辩题：{topic}\n\n"
            f"完整辩论记录：\n{full_history}\n\n"
            f"请综合双方观点，给出最终结论。"
        )
        print(f"\033[35m--- 裁判结论 ---\033[0m\n{verdict}\n")

        return verdict


def format_history(history: list) -> str:
    """格式化辩论历史"""
    if not history:
        return "（暂无记录）"
    return "\n\n".join(f"【{role}】：{content}" for role, content in history)


def demo_debate():
    """辩论模式演示"""
    print("\033[1;33m\n═══════════════════════════════════════")
    print("  模式 4：辩论模式（Debate）")
    print("  流程：[正方] ⇄ [反方] × N轮 → [裁判] → 结论")
    print("═══════════════════════════════════════\033[0m\n")

    system = DebateSystem()
    topic = "AI Agent 是否应该拥有自主决策权？"
    system.run(topic, rounds=2)


# ===================================================================
# 交互模式
# ===================================================================

def interactive_mode():
    """交互式 Multi-Agent 演示"""
    print(f"\033[1;35m{'='*60}\033[0m")
    print(f"\033[1;35m  07 Multi-Agent 交互模式 | 模型={MODEL}\033[0m")
    print(f"\033[1;35m{'='*60}\033[0m")
    print()
    print("  可选模式：")
    print("    1 - 串行模式（调研→写作→审核）")
    print("    2 - 路由模式（意图识别→专业Agent）")
    print("    3 - 协作模式（研究团队）")
    print("    4 - 辩论模式（正反方辩论）")
    print()
    print("    q - 退出")
    print()

    while True:
        try:
            choice = input("\033[36m选择模式 (1/2/3/4) >> \033[0m").strip()
        except (EOFError, KeyboardInterrupt):
            break

        if choice in ("q", "exit", ""):
            break

        if choice == "1":
            demo_pipeline()
        elif choice == "2":
            demo_router()
        elif choice == "3":
            demo_collaborative()
        elif choice == "4":
            demo_debate()
        else:
            print("无效选择，请输入 1-4 或 q 退出")

        print()


# ===================================================================
# 主入口
# ===================================================================

if __name__ == "__main__":
    import sys

    # 直接运行某个模式的演示
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg == "1" or arg == "pipeline":
            demo_pipeline()
        elif arg == "2" or arg == "router":
            demo_router()
        elif arg == "3" or arg == "collaborative":
            demo_collaborative()
        elif arg == "4" or arg == "debate":
            demo_debate()
        else:
            print(f"未知参数：{arg}")
            print("用法：python3 07_multi_agent.py [1|2|3|4|pipeline|router|collaborative|debate]")
    else:
        # 无参数：进入交互模式
        interactive_mode()
