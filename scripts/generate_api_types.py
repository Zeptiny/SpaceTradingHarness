#!/usr/bin/env python3
"""Generate TypeScript route constants and schema types from openapi.json.

Outputs (never hand-edit; regenerate with `npm run codegen`):
  src/generated/routes.ts  - typed route table (method, path, path params)
  src/generated/types.ts   - interfaces + enum unions for all component schemas,
                             plus one unwrapped response type per operation.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "openapi.json"
OUT = ROOT / "src" / "generated"

spec = json.loads(SPEC.read_text())

TS_KEYWORDS = {
    "break", "case", "catch", "class", "const", "continue", "debugger",
    "default", "delete", "do", "else", "enum", "export", "extends",
    "false", "finally", "for", "function", "if", "import", "in",
    "instanceof", "new", "null", "return", "super", "switch", "this",
    "throw", "true", "try", "typeof", "var", "void", "while", "with",
    "interface", "let", "package", "private", "protected", "public",
    "static", "yield", "any", "boolean", "number", "string", "symbol",
}


def safe_prop(name: str) -> str:
    if name in TS_KEYWORDS or not re.match(r"^[A-Za-z_$][A-Za-z0-9_$]*$", name):
        return f'"{name}"'
    return name


def ts_type(node) -> str:
    if not isinstance(node, dict):
        return "unknown"
    if "$ref" in node:
        return node["$ref"].split("/")[-1]
    nullable = "| null" if node.get("nullable") else ""
    if "allOf" in node:
        parts = [ts_type(s) for s in node["allOf"]]
        parts = [p for p in parts if p != "unknown"]
        core = " & ".join(f"({p})" for p in parts) if parts else "unknown"
        return core + nullable if nullable else core
    if "oneOf" in node:
        return " | ".join(f"({ts_type(s)})" for s in node["oneOf"]) + nullable
    if "anyOf" in node:
        return " | ".join(f"({ts_type(s)})" for s in node["anyOf"]) + nullable
    t = node.get("type")
    if t == "array":
        return f"{ts_type(node.get('items', {}))}[]{nullable}"
    if t == "string":
        if "enum" in node:
            return " | ".join(json.dumps(v) for v in node["enum"]) + nullable
        return "string" + nullable
    if t in ("integer", "number"):
        return "number" + nullable
    if t == "boolean":
        return "boolean" + nullable
    if t == "object" or "properties" in node:
        return inline_object(node) + nullable
    return "unknown" + nullable


def inline_object(node) -> str:
    props = node.get("properties", {})
    req = set(node.get("required", []))
    if not props:
        ap = node.get("additionalProperties")
        if isinstance(ap, dict):
            return f"Record<string, {ts_type(ap)}>"
        return "Record<string, unknown>"
    parts = []
    for name, sub in props.items():
        sub = sub if isinstance(sub, dict) else {}
        opt = "" if name in req or sub.get("nullable") else "?"
        parts.append(f"{safe_prop(name)}{opt}: {ts_type(sub)}")
    return "{ " + "; ".join(parts) + " }"


def generate_types() -> str:
    schemas = spec.get("components", {}).get("schemas", {})
    lines = [
        "// GENERATED from openapi.json — do not edit. Run `npm run codegen`.",
        "",
    ]
    for name, sch in schemas.items():
        desc = sch.get("description")
        if desc:
            lines.append(f"/** {' '.join(desc.split())} */")
        lines.append(f"export type {name} = {ts_type(sch)};")
        if isinstance(sch, dict) and sch.get("enum"):
            vals = ", ".join(json.dumps(v) for v in sch["enum"])
            lines.append(f"export const {name}Values = [{vals}] as const satisfies readonly {name}[];")
        lines.append("")

    # Per-operation response types (unwrapped from the { data } envelope).
    lines.append("// ---- Operation response types (unwrapped from { data, meta }) ----")
    lines.append("")
    for path, methods in spec.get("paths", {}).items():
        for method, op in methods.items():
            if method not in ("get", "post", "put", "patch", "delete"):
                continue
            op_id = op.get("operationId")
            if not op_id:
                continue
            key = re.sub(r"-(.)", lambda m: m.group(1).upper(), op_id)
            responses = op.get("responses", {})
            schema = None
            for code in ("200", "201", "202", "204"):
                r = responses.get(code)
                if not r:
                    continue
                for ctype in ("application/json",):
                    s = (r.get("content", {}).get(ctype, {}) or {}).get("schema")
                    if s:
                        schema = s
                        break
                if schema:
                    break
            if schema is None:
                continue
            inner = schema
            if (
                isinstance(schema, dict)
                and schema.get("type") == "object"
                and set(schema.get("properties", {}).keys()) in ({"data"}, {"data", "meta"})
            ):
                inner = schema["properties"]["data"]
            lines.append(f"export type {key}Response = {ts_type(inner)};")
            lines.append("")
    return "\n".join(lines)


def path_params(path: str) -> list[str]:
    return re.findall(r"\{([^}]+)\}", path)


def camel(s: str) -> str:
    parts = re.split(r"[^a-zA-Z0-9]+", s)
    return parts[0] + "".join(p.capitalize() for p in parts[1:] if p)


def generate_routes() -> str:
    lines = [
        "// GENERATED from openapi.json — do not edit. Run `npm run codegen`.",
        "",
        "export interface RouteDef {",
        "  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';",
        "  path: string;",
        "  pathParams: string[];",
        "  operationId: string;",
        "}",
        "",
        "export const routes = {",
    ]
    for path, methods in spec.get("paths", {}).items():
        for method, op in methods.items():
            if method not in ("get", "post", "put", "patch", "delete"):
                continue
            op_id = op.get("operationId") or camel(f"{method} {path}")
            key = re.sub(r"-(.)", lambda m: m.group(1).upper(), op_id)
            params = path_params(path)
            params_str = ", ".join(f"'{p}'" for p in params) or ""
            lines.append(f"  {key}: {{")
            lines.append(f"    method: '{method.upper()}',")
            lines.append(f"    path: '{path}',")
            lines.append(f"    pathParams: [{params_str}],")
            lines.append(f"    operationId: '{op_id}',")
            lines.append("  },")
    lines.append("} as const satisfies Record<string, RouteDef>;")
    lines.append("")
    lines.append("export type RouteName = keyof typeof routes;")
    lines.append("")
    return "\n".join(lines)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "routes.ts").write_text(generate_routes())
    (OUT / "types.ts").write_text(generate_types())
    n_schemas = len(spec.get("components", {}).get("schemas", {}))
    n_ops = sum(
        1
        for methods in spec.get("paths", {}).values()
        for m in methods
        if m in ("get", "post", "put", "patch", "delete")
    )
    print(f"generated: src/generated/routes.ts ({n_ops} routes), types.ts ({n_schemas} schemas + {n_ops} response types)")


if __name__ == "__main__":
    main()
