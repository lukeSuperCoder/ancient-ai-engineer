#!/usr/bin/env python3
"""
实验3: Few-shot 提示 (Few-shot Prompting)

学习目标：
  - 理解 Few-shot 的工作原理
  - 学会设计有效的示例集
  - 掌握 Zero-shot vs One-shot vs Few-shot 的效果差异

核心概念：
  Few-shot = 通过给出几个输入-输出示例，让模型"学会"你期望的格式。
  示例是最高效的"沟通语言"——比任何描述都直观。

运行方式：
  python e03_few_shot.py
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
# 场景1: Zero-shot (无示例)
# ============================================================
ZERO_SHOT_PROMPT = """
你是一个情感分析助手。判断用户文本的情感倾向。
"""


def zero_shot_classify(text: str) -> str:
    """
    Zero-shot 分类：不给任何示例，直接让模型判断。
    
    问题：模型不知道你期望什么格式，输出可能千奇百怪。
    
    Args:
        text: 待分类的文本
    
    Returns:
        模型的原始回复
    """
    response = client.messages.create(
        model=MODEL,
        system=ZERO_SHOT_PROMPT,
        max_tokens=500,
        messages=[{"role": "user", "content": f"分析：{text}"}]
    )
    return response.content[0].text


# ============================================================
# 场景2: One-shot (一个示例)
# ============================================================
ONE_SHOT_PROMPT = """
你是一个情感分析助手。判断用户文本的情感倾向，并以 JSON 格式输出。

示例：
输入："这个产品太棒了，我非常喜欢！"
输出：{"情感": "积极", "置信度": 0.95, "关键词": ["棒", "喜欢"]}
"""


def one_shot_classify(text: str) -> str:
    """
    One-shot 分类：给一个示例，让模型理解期望的格式。
    
    改进：模型看到了一个完整的示例，输出格式会趋于一致。
    
    Args:
        text: 待分类的文本
    
    Returns:
        模型的原始回复
    """
    response = client.messages.create(
        model=MODEL,
        system=ONE_SHOT_PROMPT,
        max_tokens=500,
        messages=[{"role": "user", "content": f"分析：{text}"}]
    )
    return response.content[0].text


# ============================================================
# 场景3: Few-shot (多个示例)
# ============================================================
FEW_SHOT_PROMPT = """
你是一个情感分析助手。判断用户文本的情感倾向，并以 JSON 格式输出。

示例1：
输入："这个产品太棒了，我非常喜欢！"
输出：{"情感": "积极", "置信度": 0.95, "关键词": ["棒", "喜欢"]}

示例2：
输入："质量一般般，不值这个价格。"
输出：{"情感": "消极", "置信度": 0.80, "关键词": ["一般般", "不值"]}

示例3：
输入："还可以吧，没什么特别的。"
输出：{"情感": "中性", "置信度": 0.70, "关键词": ["还可以", "没什么特别"]}

示例4：
输入："客服态度很差，再也不买了！"
输出：{"情感": "消极", "置信度": 0.92, "关键词": ["差", "不买"]}
"""


def few_shot_classify(text: str) -> str:
    """
    Few-shot 分类：给多个示例，覆盖不同情况。
    
    改进：
    - 多个示例让模型更清楚格式要求
    - 覆盖了积极/消极/中性三种情况
    - 输出格式非常稳定，可被程序解析
    
    Args:
        text: 待分类的文本
    
    Returns:
        模型的原始回复
    """
    response = client.messages.create(
        model=MODEL,
        system=FEW_SHOT_PROMPT,
        max_tokens=500,
        messages=[{"role": "user", "content": f"分析：{text}"}]
    )
    return response.content[0].text


# ============================================================
# 场景4: Few-shot 用于复杂格式转换
# ============================================================
FORMAT_CONVERT_PROMPT = """
你是一个代码文档生成器。根据函数代码生成标准格式的文档字符串。

示例1：
输入：
def add(a, b):
    return a + b

输出：
def add(a, b):
    \"\"\"两数相加。

    Args:
        a (int|float): 第一个加数。
        b (int|float): 第二个加数。

    Returns:
        int|float: a 与 b 的和。
    \"\"\"
    return a + b

示例2：
输入：
def find_max(lst):
    m = lst[0]
    for x in lst:
        if x > m:
            m = x
    return m

输出：
def find_max(lst):
    \"\"\"在列表中查找最大值。

    Args:
        lst (list): 包含可比元素的列表。

    Returns:
        最大元素值。

    Raises:
        IndexError: 列表为空时。
    \"\"\"
    m = lst[0]
    for x in lst:
        if x > m:
            m = x
    return m
"""


def convert_docstring(code: str) -> str:
    """
    使用 Few-shot 示例将代码转换为带文档字符串的版本。
    
    这个场景展示了 Few-shot 在代码转换任务中的强大能力。
    通过两个示例，模型学会了：
    1. Google 风格的 docstring 格式
    2. 需要分析参数类型和返回值
    3. 需要考虑异常情况
    
    Args:
        code: 原始代码
    
    Returns:
        添加了文档字符串的代码
    """
    response = client.messages.create(
        model=MODEL,
        system=FORMAT_CONVERT_PROMPT,
        max_tokens=1000,
        messages=[{"role": "user", "content": f"请为以下函数添加文档字符串：\n\n{code}"}]
    )
    return response.content[0].text


# ============================================================
# 主程序
# ============================================================
if __name__ == "__main__":
    print("🧪 实验3: Few-shot 提示效果对比")
    print("=" * 60)
    print("选项:")
    print("  1 - Zero/One/Few-shot 对比 (情感分析)")
    print("  2 - Few-shot 代码转换 (文档字符串生成)")
    print("  q - 退出")
    print("=" * 60)
    
    # 测试文本
    test_texts = [
        "这家餐厅的服务态度很好，菜品也很精致，下次还来！",
        "快递等了一周才到，包装还破了，差评。",
        "功能基本满足需求，但界面可以再优化一下。",
    ]
    
    # 测试代码
    test_codes = [
        "def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)",
        "def read_config(path):\n    with open(path) as f:\n        return json.load(f)",
    ]
    
    while True:
        try:
            choice = input("\n🎯 请选择实验 (1/2/q): ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            break
        
        if choice in ("q", "exit", ""):
            break
        
        if choice == "1":
            # 情感分析对比
            for text in test_texts:
                print(f"\n{'=' * 60}")
                print(f"📌 测试文本: {text}")
                print(f"{'=' * 60}")
                
                # Zero-shot
                print("\n🔹 Zero-shot (无示例):")
                r1 = zero_shot_classify(text)
                print(f"   {r1[:200]}")
                
                # One-shot
                print("\n🔹 One-shot (1个示例):")
                r2 = one_shot_classify(text)
                print(f"   {r2[:200]}")
                
                # Few-shot
                print("\n🔹 Few-shot (4个示例):")
                r3 = few_shot_classify(text)
                print(f"   {r3[:200]}")
                
                # 尝试解析 Few-shot 的 JSON 输出
                try:
                    parsed = json.loads(r3.strip())
                    print(f"   ✅ JSON 解析成功: {parsed}")
                except json.JSONDecodeError:
                    print(f"   ❌ JSON 解析失败")
        
        elif choice == "2":
            # 代码文档生成
            for code in test_codes:
                print(f"\n{'=' * 60}")
                print(f"📌 原始代码:\n{code}")
                print(f"{'=' * 60}")
                
                result = convert_docstring(code)
                print(f"\n📝 添加文档字符串后:\n{result}")
        
        else:
            print("未知选项")
    
    print("\n✅ 实验3结束")
    print("💡 关键收获:")
    print("   1. Zero-shot 输出格式不可控，无法程序化处理")
    print("   2. One-shot 开始稳定，但覆盖面不够")
    print("   3. Few-shot (3-5个) 是最佳平衡点")
    print("   4. 示例要有代表性和多样性")
    print("   5. Few-shot 是最高效的'格式沟通'方式")
