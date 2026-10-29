import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const WIDGET_URI = "ui://e-prazdnik/sergey-day/v0.2.html";
const widgetHtml = readFileSync(new URL("./web/widget.html", import.meta.url), "utf8");

function createPlannerServer() {
  const server = new McpServer({ name: "e-prazdnik-sergey-ui", version: "0.2.0" });

  registerAppResource(server, "sergey-day-widget", WIDGET_URI, {}, async () => ({
    contents: [{
      uri: WIDGET_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: widgetHtml,
      _meta: {
        ui: { prefersBorder: true },
        "openai/widgetDescription": "Интерактивный рабочий день Сергея: задачи, статусы и закрытие дня."
      }
    }]
  }));

  registerAppTool(server, "render_sergey_day", {
    title: "Показать день Сергея",
    description: "Рендерит рабочий день Сергея из актуальных данных, уже прочитанных из Google Sheets.",
    inputSchema: {
      date: z.string(),
      dateLabel: z.string(),
      updatedAt: z.string().optional(),
      currentTaskId: z.string().optional(),
      summary: z.object({
        urgent: z.number().default(0),
        remaining: z.number().default(0),
        risk: z.number().default(0),
        loadMinutes: z.number().default(0),
        capacityMinutes: z.number().default(420)
      }).passthrough(),
      items: z.array(z.object({
        kind: z.enum(["task","regular","service"]).default("task"),
        id: z.string().optional(),
        title: z.string(),
        start: z.string().optional(),
        end: z.string().optional(),
        priority: z.string().optional(),
        status: z.string().optional(),
        statusLabel: z.string().optional(),
        plannedMinutes: z.number().optional(),
        remainingMinutes: z.number().optional(),
        people: z.array(z.string()).optional(),
        expectedResult: z.string().optional(),
        material: z.string().optional(),
        risk: z.string().optional()
      }).passthrough())
    },
    _meta: { ui: { resourceUri: WIDGET_URI } }
  }, async (args) => ({
    structuredContent: args,
    content: [{ type: "text", text: `Рабочий UI Сергея за ${args.dateLabel}.` }]
  }));

  return server;
}

const port = Number(process.env.PORT ?? 8787);
const httpServer = createServer(async (req, res) => {
  if (!req.url) return res.writeHead(400).end("Missing URL");
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    return res.end("E-Prazdnik Sergey UI MCP server v0.2");
  }

  if (req.method === "OPTIONS" && url.pathname === "/mcp") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id"
    });
    return res.end();
  }

  if (url.pathname === "/mcp" && ["POST","GET","DELETE"].includes(req.method ?? "")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    const server = createPlannerServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => console.log(`Listening on :${port}`));
