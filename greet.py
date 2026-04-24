def greet(name):
    print(f"Hello, {name}!")

def goodbye(name):
    print(f"Goodbye, {name}! See you next time!")

def today_weather():
    """输出今天的天气信息"""
    from datetime import datetime
    today = datetime.now().strftime("%Y年%m月%d日")
    # 这里可以对接真实的天气API，目前使用模拟数据
    print(f"今天是 {today}")
    print(f"今天天气：晴，气温 25°C，空气质量良好 🌤️")
