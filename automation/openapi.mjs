import * as z from "zod/v4";
import { inputs, descriptions, outputs, recordOutput } from "./schemas.mjs";
import Studio from "../src/engine.mjs";

export const routes = [
  ["get", "/v1/capabilities", "capabilities"],
  ["get", "/v1/civitai/reference", "civitai_reference"],
  ["post", "/v1/images", "open_image"],
  ["get", "/v1/images/{imageId}", "read_image"],
  ["patch", "/v1/images/{imageId}", "edit_image"],
  ["delete", "/v1/images/{imageId}", "close_image"],
  ["post", "/v1/images/{imageId}/undo", "undo_image"],
  ["post", "/v1/images/{imageId}/redo", "redo_image"],
  ["post", "/v1/images/{imageId}/verify", "verify_image"],
  ["post", "/v1/images/{imageId}/import", "import_civitai_metadata"],
  ["post", "/v1/images/{imageId}/export", "export_image"],
  ["get", "/v1/images/{imageId}/report", "report_image"],
  ["post", "/v1/resources/search", "search_resources"],
  ["post", "/v1/models/hash", "hash_model"]
];
export function openapi(serverUrl = "http://127.0.0.1:4318") {
  const paths = {};
  const resultSchemas = { ImageRecord: z.toJSONSchema(recordOutput, { target: "draft-2020-12", unrepresentable: "any" }) };
  delete resultSchemas.ImageRecord.$schema;
  for (const [method, path, name] of routes) {
    const schema = z.toJSONSchema(inputs[name], { target: "draft-2020-12" });
    delete schema.$schema;
    const pathId = path.includes("{imageId}");
    delete schema.properties.imageId;
    schema.required = (schema.required || []).filter((key) => key !== "imageId");
    const parameters = pathId ? [{ name: "imageId", in: "path", required: true, schema: { type: "string", format: "uuid" } }] : [];
    const outputName = outputs[name] === recordOutput ? "ImageRecord" : `${name}_result`;
    if (!resultSchemas[outputName]) {
      resultSchemas[outputName] = z.toJSONSchema(outputs[name], { target: "draft-2020-12", unrepresentable: "any" });
      delete resultSchemas[outputName].$schema;
    }
    if (method === "get" && schema.properties.includePrompts) parameters.push({ name: "includePrompts", in: "query", schema: { type: "boolean", default: false } });
    (paths[path] ||= {})[method] = {
      operationId: name, summary: descriptions[name], parameters,
      ...(["post", "patch"].includes(method) ? { requestBody: { required: true, content: { "application/json": { schema } } } } : {}),
      responses: { "200": { description: "Structured result. Image operations include a monotonically increasing revision.", content: { "application/json": { schema: { $ref: `#/components/schemas/${outputName}` } } } },
        default: { description: "RFC 9457 problem with a stable code and requestId.", content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } } } }
    };
  }
  return { openapi: "3.2.1", info: { title: "Civitai Metadata Studio local API", version: Studio.constants.APP_VERSION, description: "Local, authenticated automation using the portable editor's canonical engine. Configured filesystem roots only. No original overwrites." },
    servers: [{ url: serverUrl }], security: [{ localBearer: [] }], paths,
    components: { securitySchemes: { localBearer: { type: "http", scheme: "bearer", description: "Local process token supplied in STUDIO_API_TOKEN. Never printed, persisted, or used as a Civitai token." } },
      schemas: { ...resultSchemas, Problem: { type: "object", required: ["type", "title", "status", "code", "requestId"], properties: { type: { type: "string" }, title: { type: "string" }, status: { type: "integer" }, code: { type: "string" }, requestId: { type: "string" } } } } } };
}
