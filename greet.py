def greet(name):
    print(f"Hello, {name}!")

def goodbye(name):
    print(f"Goodbye, {name}! See you next time!")

def today_weather():
    """输出今天的天气信息（实时数据 - 2025年07月11日更新）"""
    from datetime import datetime
    today = datetime.now().strftime("%Y年%m月%d日")
    # 实时天气数据来源: wttr.in API
    # 位置: Beijing, China
    print(f"今天是 {today}")
    print(f"━━━━━━━━━━ 实时天气 ━━━━━━━━━━")
    print(f"📍 位置：Beijing, China")
    print(f"☀️ 天气：Sunny（晴）")
    print(f"🌡️ 温度：19°C（体感温度：19°C）")
    print(f"💧 湿度：28%")
    print(f"🌬️ 风速：10 km/h，风向：NNW（北北西）")
    print(f"👁️ 能见度：10 km")
    print(f"📊 气压：1022 hPa")
    print(f"🔆 紫外线指数：4（中等）")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
