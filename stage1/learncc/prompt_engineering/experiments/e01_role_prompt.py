#!/usr/bin/env python3
"""
实验1: 角色提示词 (Role Prompt)

学习目标：
  - 理解 System Prompt 的基本用法
  - 体验有/无角色提示词的输出差异
  - 学会设计有效的角色描述

核心概念：
  角色提示词 = 给模型一个明确的身份，让它从特定角度思考和回答。
  好的角色提示词能让输出质量显著提升。

运行方式：
  python e01_role_prompt.py
"""
import os
from anthropic import Anthropic
from dotenv import load_dotenv

# 加载环境变量
load_dotenv(override=True)

# 初始化客户端（支持 Anthropic 兼容的第三方 API）
client = Anthropic(base_url=os.getenv("ANTHROPIC_BASE_URL"))
MODEL = os.environ["MODEL_ID"]

# ============================================================
# 场景1: 没有角色提示词（基线对照）
# ============================================================
def no_role_query(question: str) -> str:
    """
    不使用任何系统提示词，直接提问。
    作为基线对照组，观察无角色约束时的输出质量。
    
    Args:
        question: 用户的问题
    
    Returns:
        模型的回复文本
    """
    response = client.messages.create(
        model=MODEL,
        max_tokens=1000,
        messages=[{"role": "user", "content": question}]
    )
    return response.content[0].text


# ============================================================
# 场景2: 简单角色提示词
# ============================================================
SIMPLE_ROLE = "你是一个 Python 编程专家。"


def simple_role_query(question: str) -> str:
    """
    使用简单的角色提示词。
    对比无角色版本，观察仅加一句话的效果差异。
    
    Args:
        question: 用户的问题
    
    Returns:
        模型的回复文本
    """
    response = client.messages.create(
        model=MODEL,
        system=SIMPLE_ROLE,
        max_tokens=1000,
        messages=[{"role": "user", "content": question}]
    )
    return response.content[0].text


# ============================================================
# 场景3: 详细角色提示词
# ============================================================
DETAILED_ROLE = """
你是一个拥有 10 年经验的高级 Python 开发工程师。

你的专业领域：
- 后端开发 (FastAPI, Django)
- 数据处理 (pandas, numpy)
- 系统设计 (微服务, 消息队列)

你的回答风格：
- 先给出完整代码，再逐段解释关键逻辑
- 所有代码包含清晰的中文注释
- 标注时间复杂度和空间复杂度
- 处理边界情况和异常
- 遵循 PEP 8 编码规范
"""


def detailed_role_query(question: str) -> str:
    """
    使用详细的角色提示词。
    包含身份、经验、专业领域和回答风格。
    
    Args:
        question: 用户的问题
    
    Returns:
        模型的回复文本
    """
    response = client.messages.create(
        model=MODEL,
        system=DETAILED_ROLE,
        max_tokens=1000,
        messages=[{"role": "user", "content": question}]
    )
    return response.content[0].text


# ============================================================
# 主程序：交互式对比实验
# ============================================================
def run_comparison(question: str):
    """
    对比三种角色提示词的效果。
    
    依次展示：
    1. 无角色提示词
    2. 简单角色提示词
    3. 详细角色提示词
    
    Args:
        question: 用于测试的问题
    """
    separator = "=" * 60
    
    print(f"\n{separator}")
    print(f"📌 问题: {question}")
    print(separator)
    
    # 场景1: 无角色
    print("\n🔹 场景1: 无角色提示词")
    print("-" * 40)
    result1 = no_role_query(question)
    print(result1[:500])
    if len(result1) > 500:
        print(f"... (共 {len(result1)} 字符)")
    
    # 场景2: 简单角色
    print("\n🔹 场景2: 简单角色提示词")
    print(f"   System: \"{SIMPLE_ROLE}\"")
    print("-" * 40)
    result2 = simple_role_query(question)
    print(result2[:500])
    if len(result2) > 500:
        print(f"... (共 {len(result2)} 字符)")
    
    # 场景3: 详细角色
    print("\n🔹 场景3: 详细角色提示词")
    print(f"   System: [多行详细角色描述]")
    print("-" * 40)
    result3 = detailed_role_query(question)
    print(result3[:500])
    if len(result3) > 500:
        print(f"... (共 {len(result3)} 字符)")
    
    # 分析对比
    print(f"\n{separator}")
    print("📊 对比分析:")
    print(f"   无角色   输出长度: {len(result1)} 字符")
    print(f"   简单角色 输出长度: {len(result2)} 字符")
    print(f"   详细角色 输出长度: {len(result3)} 字符")
    print(separator)


if __name__ == "__main__":
    print("🧪 实验1: 角色提示词效果对比")
    print("=" * 60)
    print("提示: 输入问题进行测试，输入 q 退出")
    print("预设问题: 直接回车使用预设问题")
    print("=" * 60)
    
    # 预设的测试问题
    default_questions = [
        "帮我写一个函数，检查一个字符串是否是有效的邮箱地址",
        "如何实现一个简单的 LRU 缓存？",
        "解释一下 Python 中的装饰器",
    ]
    
    while True:
        try:
            user_input = input("\n🎯 请输入问题 (回车=预设, q=退出): ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        
        if user_input.lower() in ("q", "exit", "quit"):
            break
        
        # 选择问题
        if user_input:
            question = user_input
        else:
            # 循环使用预设问题
            idx = 0
            question = default_questions[idx % len(default_questions)]
            print(f"   使用预设问题: {question}")
        
        # 运行对比实验
        run_comparison(question)
    
    print("\n✅ 实验1结束")
    print("💡 关键收获:")
    print("   1. 有角色的输出比无角色更专业、更聚焦")
    print("   2. 详细角色比简单角色更一致、更可预测")
    print("   3. 角色描述越具体，输出质量越高")
