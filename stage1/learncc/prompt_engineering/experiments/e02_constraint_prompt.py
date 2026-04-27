#!/usr/bin/env python3
"""
实验2: 约束提示词 (Constraint Prompt)

学习目标：
  - 学会用约束条件控制模型的输出格式
  - 理解正面约束和负面约束的使用场景
  - 掌握格式模板的设计方法

核心概念：
  约束提示词 = 用明确的规则限制模型的行为和输出格式。
  好的约束让输出可以被程序直接解析和使用。

运行方式：
  python e02_constraint_prompt.py
"""
import json
import os
from anthropic import Anthropic
from dotenv import load_dotenv

# 加载环境变量
load_dotenv(override=True)
client = Anthropic(base_url=os.getenv("ANTHROPIC_BASE_URL"))
MODEL = os.environ["MODEL_ID"]

# ============================================================
# 约束策略1: 格式约束 - 强制 JSON 输出
# ============================================================
JSON_CONSTRAINT = """
你是一个代码审查助手。

严格约束：
1. 你的输出必须是合法的 JSON 格式
2. 不要输出任何 JSON 之外的内容（包括 markdown 标记）
3. 不要用 ```json 包裹输出

JSON 结构必须如下：
{
  "summary": "一句话总结代码功能",
  "issues": [
    {
      "severity": "严重|警告|建议",
      "location": "位置描述",
      "description": "问题描述",
      "suggestion": "修复建议"
    }
  ],
  "score": 85,
  "overall_comment": "总体评价"
}
"""


def review_with_json_constraint(code: str) -> dict:
    """
    使用格式约束，强制模型输出 JSON。
    
    Args:
        code: 待审查的代码
    
    Returns:
        解析后的 JSON 字典，如果解析失败返回 None
    """
    response = client.messages.create(
        model=MODEL,
        system=JSON_CONSTRAINT,
        max_tokens=2000,
        messages=[{"role": "user", "content": f"请审查以下代码：\n```\n{code}\n```"}]
    )
    text = response.content[0].text
    
    # 尝试解析 JSON
    try:
        # 去除可能的 markdown 标记
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(text)
    except json.JSONDecodeError:
        print(f"⚠️ JSON 解析失败，原始输出：{text[:200]}")
        return {"raw": text, "parse_error": True}


# ============================================================
# 约束策略2: 行为约束 - 定义"必须"和"禁止"
# ============================================================
BEHAVIOR_CONSTRAINT = """
你是一个技术面试题生成器。

必须遵守：
1. 每道题必须包含：题目、难度等级、考察点、参考答案
2. 难度分为：初级 / 中级 / 高级
3. 题目必须原创，不能照搬常见题库
4. 参考答案必须包含代码示例

绝对禁止：
1. 禁止生成与政治、宗教相关的内容
2. 禁止给出无法验证的答案
3. 禁止在答案中包含"根据我的经验"等模糊表述

输出格式：
## 题目 [难度等级]
[题目内容]

### 考察点
- [考察点1]
- [考察点2]

### 参考答案
```python
# 代码示例
```
"""


def generate_interview_question(topic: str) -> str:
    """
    使用行为约束生成面试题。
    
    Args:
        topic: 面试题主题
    
    Returns:
        格式化的面试题文本
    """
    response = client.messages.create(
        model=MODEL,
        system=BEHAVIOR_CONSTRAINT,
        max_tokens=2000,
        messages=[{"role": "user", "content": f"请生成一道关于 {topic} 的面试题"}]
    )
    return response.content[0].text


# ============================================================
# 约束策略3: 长度约束 - 控制输出长度
# ============================================================
LENGTH_CONSTRAINT = """
你是一个技术摘要助手。

长度约束：
- 摘要必须在 100-150 字之间
- 不超过 5 个要点
- 每个要点不超过 30 字

格式约束：
- 使用要点列表 (•)
- 不使用 Markdown 标题
- 每个要点以动词开头
"""


def summarize_with_length(text: str) -> str:
    """
    使用长度约束生成摘要。
    
    Args:
        text: 待摘要的文本
    
    Returns:
        约束长度内的摘要文本
    """
    response = client.messages.create(
        model=MODEL,
        system=LENGTH_CONSTRAINT,
        max_tokens=500,
        messages=[{"role": "user", "content": f"请总结以下内容：\n\n{text}"}]
    )
    return response.content[0].text


# ============================================================
# 主程序：交互式实验
# ============================================================
if __name__ == "__main__":
    print("🧪 实验2: 约束提示词效果演示")
    print("=" * 60)
    print("选项:")
    print("  1 - JSON 格式约束 (代码审查)")
    print("  2 - 行为约束 (面试题生成)")
    print("  3 - 长度约束 (文本摘要)")
    print("  q - 退出")
    print("=" * 60)
    
    # 预设的测试代码
    test_code = '''
def get_user(id):
    conn = sqlite3.connect("users.db")
    query = "SELECT * FROM users WHERE id = " + id
    result = conn.execute(query)
    user = result.fetchone()
    conn.close()
    return user
'''
    
    # 预设的测试文本
    test_text = """
    人工智能（Artificial Intelligence，AI）是计算机科学的一个分支，致力于创建能够执行
    通常需要人类智能的任务的系统。这些任务包括学习、推理、问题解决、感知和语言理解等。
    近年来，深度学习的突破推动了 AI 技术的快速发展，特别是在自然语言处理、计算机视觉
    和语音识别等领域。大型语言模型（LLM）的出现更是改变了人们与 AI 系统交互的方式，
    使得 AI 应用开发成为一个热门的技术方向。然而，AI 技术也带来了伦理、安全和隐私等
    方面的挑战，需要业界和学术界共同关注和解决。
    """
    
    while True:
        try:
            choice = input("\n🎯 请选择实验 (1/2/3/q): ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            break
        
        if choice in ("q", "exit", ""):
            break
        
        if choice == "1":
            print("\n🔹 JSON 格式约束 - 代码审查")
            print("-" * 40)
            print(f"审查代码:\n{test_code}")
            print("-" * 40)
            result = review_with_json_constraint(test_code)
            print("📊 解析结果:")
            print(json.dumps(result, ensure_ascii=False, indent=2))
        
        elif choice == "2":
            print("\n🔹 行为约束 - 面试题生成")
            print("-" * 40)
            topic = input("请输入主题 (回车=Python装饰器): ").strip() or "Python装饰器"
            result = generate_interview_question(topic)
            print("📝 生成结果:")
            print(result)
        
        elif choice == "3":
            print("\n🔹 长度约束 - 文本摘要")
            print("-" * 40)
            result = summarize_with_length(test_text)
            char_count = len(result)
            print(f"📏 摘要 ({char_count} 字):")
            print(result)
            print(f"\n  字数: {char_count} (目标: 100-150)")
        
        else:
            print("未知选项，请重新选择")
    
    print("\n✅ 实验2结束")
    print("💡 关键收获:")
    print("   1. 格式约束让输出可被程序解析（JSON、XML 等）")
    print("   2. 行为约束让模型在边界内安全运行")
    print("   3. 长度约束控制输出成本和质量")
    print("   4. 约束越明确，遵循率越高")
