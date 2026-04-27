# 系统提示词工程 (System Prompt Engineering)

> 本项目是 AI 应用开发进阶学习路线 **阶段一** 的核心实践模块。

## 📌 学习目标

通过本项目的学习与实践，你将掌握：

1. **System Prompt 的本质**：为什么 System Prompt 是 AI 应用开发中最重要的环节
2. **提示词构建管线**：如何像工程师一样组织提示词，而非随意堆砌文本
3. **六大核心策略**：Role / Constraint / Few-shot / CoT / Template / Dynamic Context
4. **实战演练**：通过 7 个渐进式实验，亲手构建和优化系统提示词

## 📁 项目结构

```
prompt_engineering/
├── README.md                       # 本文件 - 项目说明
├── experiments/                    # 实验代码目录
│   ├── e01_role_prompt.py          # 实验1: 角色提示词
│   ├── e02_constraint_prompt.py    # 实验2: 约束提示词
│   ├── e03_few_shot.py             # 实验3: Few-shot 示例
│   ├── e04_chain_of_thought.py     # 实验4: 思维链
│   ├── e05_template_system.py      # 实验5: 提示词模板系统
│   ├── e06_dynamic_context.py      # 实验6: 动态上下文注入
│   └── e07_full_pipeline.py        # 实验7: 完整提示词工程管线
├── templates/                      # 提示词模板存储
│   ├── coder.md                    # 编程助手模板
│   ├── analyst.md                  # 数据分析模板
│   ├── writer.md                   # 写作助手模板
│   └── translator.md               # 翻译助手模板
└── docs/                           # 文档目录
    ├── 01_prompt_basics.md         # 提示词基础理论
    ├── 02_six_strategies.md        # 六大策略详解
    └── 03_best_practices.md        # 最佳实践指南
```

## 🚀 快速开始

```bash
# 1. 安装依赖
pip install anthropic python-dotenv

# 2. 配置 .env（在项目根目录）
# 参考 .env.example

# 3. 运行实验
cd experiments
python e01_role_prompt.py
```

## 📖 学习路径

```
实验1 (角色) → 实验2 (约束) → 实验3 (Few-shot) → 实验4 (思维链)
     ↓
实验5 (模板系统) → 实验6 (动态上下文) → 实验7 (完整管线)
```

建议按顺序完成每个实验，每个实验约 15-30 分钟。

## 🎯 学完标准

- [ ] 能解释 System Prompt 和 User Prompt 的区别
- [ ] 能为不同场景设计合适的角色提示词
- [ ] 能用约束条件控制模型输出格式
- [ ] 能用 Few-shot 引导模型行为
- [ ] 能用思维链提升推理质量
- [ ] 能设计可复用的提示词模板
- [ ] 能构建完整的动态提示词管线
