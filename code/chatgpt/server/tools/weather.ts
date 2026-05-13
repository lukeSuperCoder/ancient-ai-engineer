import { z } from "zod";
import { getModelConfig } from "../config";
import type { ToolDefinition } from "../agent/types";
import { fetchJson } from "./http";

const weatherArgsSchema = z.object({
  city: z.string().min(1, "城市不能为空").describe("城市或地区名称，例如 北京、上海、纽约"),
  adm: z.string().optional().describe("可选，上级行政区划，用于区分重名城市，例如 陕西、黑龙江"),
});

type WeatherArgs = z.infer<typeof weatherArgsSchema>;

type QWeatherLocation = {
  name: string;
  id: string;
  adm1?: string;
  adm2?: string;
  country?: string;
  tz?: string;
  fxLink?: string;
};

type CityLookupResponse = {
  code: string;
  location?: QWeatherLocation[];
};

type WeatherNowResponse = {
  code: string;
  updateTime?: string;
  fxLink?: string;
  now?: {
    obsTime?: string;
    temp?: string;
    feelsLike?: string;
    icon?: string;
    text?: string;
    wind360?: string;
    windDir?: string;
    windScale?: string;
    windSpeed?: string;
    humidity?: string;
    precip?: string;
    pressure?: string;
    vis?: string;
    cloud?: string;
    dew?: string;
  };
};

function requireQWeatherToken() {
  const { qweatherApiToken } = getModelConfig();

  if (!qweatherApiToken) {
    throw new Error("缺少 QWEATHER_API_TOKEN，无法调用和风天气 API。");
  }

  return qweatherApiToken;
}

function buildQWeatherUrl(pathname: string, params: Record<string, string>) {
  const { qweatherApiHost } = getModelConfig();
  const url = new URL(pathname, qweatherApiHost);

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

async function lookupCity(args: WeatherArgs) {
  const token = requireQWeatherToken();
  const url = buildQWeatherUrl("/geo/v2/city/lookup", {
    location: args.city,
    adm: args.adm ?? "",
    lang: "zh",
    number: "1",
  });

  const data = await fetchJson<CityLookupResponse>(
    url,
    {
      headers: {
        "X-QW-Api-Key": token,
      },
    },
    "和风天气城市搜索失败",
  );

  if (data.code !== "200") {
    throw new Error(`和风天气城市搜索失败：状态码 ${data.code}`);
  }

  const location = data.location?.[0];

  if (!location) {
    throw new Error(`没有找到城市：${args.city}`);
  }

  return location;
}

export const weatherTool = {
  name: "get_weather",
  description: "当用户询问某个城市当前天气、温度、体感温度、湿度、风力、降水等信息时使用。",
  inputSchema: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "城市或地区名称，例如 北京、上海、纽约",
      },
      adm: {
        type: "string",
        description: "可选，上级行政区划，用于区分重名城市，例如 陕西、黑龙江",
      },
    },
    required: ["city"],
    additionalProperties: false,
  },
  argsSchema: weatherArgsSchema,
  async execute(args) {
    const token = requireQWeatherToken();
    const location = await lookupCity(args);
    const url = buildQWeatherUrl("/v7/weather/now", {
      location: location.id,
      lang: "zh",
      unit: "m",
    });

    const data = await fetchJson<WeatherNowResponse>(
      url,
      {
        headers: {
          "X-QW-Api-Key": token,
        },
      },
      "和风天气实时天气查询失败",
    );

    if (data.code !== "200" || !data.now) {
      throw new Error(`和风天气实时天气查询失败：状态码 ${data.code}`);
    }

    return {
      city: location.name,
      adm1: location.adm1,
      adm2: location.adm2,
      country: location.country,
      timezone: location.tz,
      locationId: location.id,
      updateTime: data.updateTime,
      fxLink: data.fxLink || location.fxLink,
      source: "QWeather",
      now: {
        obsTime: data.now.obsTime,
        text: data.now.text,
        tempC: data.now.temp,
        feelsLikeC: data.now.feelsLike,
        windDir: data.now.windDir,
        windScale: data.now.windScale,
        windSpeedKmh: data.now.windSpeed,
        humidityPercent: data.now.humidity,
        precipMm: data.now.precip,
        pressureHpa: data.now.pressure,
        visibilityKm: data.now.vis,
        cloudPercent: data.now.cloud,
        dewC: data.now.dew,
      },
    };
  },
} satisfies ToolDefinition<WeatherArgs, unknown>;
