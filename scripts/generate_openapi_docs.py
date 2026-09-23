#!/usr/bin/env python3
"""Generate markdown reference docs from the SpaceTraders OpenAPI spec.

Outputs:
  docs/openapi/README.md            - overview + route index
  docs/openapi/routes/<Tag>/<Route>.md  - one file per operation
  docs/openapi/schemas/<Name>.md    - one file per component schema
"""
import json
import re
from collections import OrderedDict
from pathlib import Path

SPEC = Path(__file__).resolve().parent.parent / "openapi.json"
OUT = Path(__file__).resolve().parent.parent / "docs" / "openapi"

spec = json.loads(SPEC.read_text())

METHOD_ORDER = ["get", "post", "put", "patch", "delete", "head", "options", "trace"]

HTTP_STATUS_TEXT = {
    "200": "OK",
    "201": "Created",
    "202": "Accepted",
    "204": "No Content",
    "400": "Bad Request",
    "401": "Unauthorized",
    "403": "Forbidden",
    "404": "Not Found",
    "405": "Method Not Allowed",
    "408": "Request Timeout",
    "409": "Conflict",
    "413": "Payload Too Large",
    "422": "Unprocessable Entity",
    "429": "Too Many Requests",
    "500": "Internal Server Error",
    "501": "Not Implemented",
    "503": "Service Unavailable",
}


def slug(text: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-")


def ref_name(node):
    if isinstance(node, dict) and "$ref" in node:
        return node["$ref"].split("/")[-1]
    return None


def schema_link(name):
    return f"[`{name}`](../schemas/{name}.md)"


def is_primitive(node):
    if not isinstance(node, dict):
        return True
    if "$ref" in node:
        return True
    t = node.get("type")
    if t in ("string", "integer", "number", "boolean"):
        return True
    return False


def is_expandable(node):
    """True when expanding the node inline adds information beyond its type label."""
    if not isinstance(node, dict) or "$ref" in node:
        return False
    if "oneOf" in node or "anyOf" in node or "allOf" in node:
        return True
    t = node.get("type")
    if t == "array":
        return not is_primitive(node.get("items", {}))
    if t == "object" or "properties" in node:
        return bool(node.get("properties"))
    return False


def type_label(node):
    if not isinstance(node, dict):
        return "any"
    name = ref_name(node)
    if name:
        return f"[{name}](../schemas/{name}.md)"
    t = node.get("type")
    if t == "array":
        return f"{type_label(node.get('items', {}))}[]"
    if t in ("integer", "number"):
        fmt = node.get("format")
        return f"{t}{f' ({fmt})' if fmt else ''}"
    if t == "string":
        if "enum" in node:
            return "string enum: " + ", ".join(f"`{v}`" for v in node["enum"])
        fmt = node.get("format")
        return f"string{f' ({fmt})' if fmt else ''}"
    if t in ("object", "boolean"):
        return t
    if "allOf" in node:
        return "allOf composite"
    if "oneOf" in node:
        return "oneOf composite"
    if "anyOf" in node:
        return "anyOf composite"
    return "any"


def schema_to_md(node, depth=0):
    """Render a schema node as a markdown bullet list."""
    pad = "  " * depth
    if node is None:
        return []

    name = ref_name(node)
    if name:
        return [f"{pad}- {schema_link(name)}"]

    if "allOf" in node:
        lines = []
        for sub in node["allOf"]:
            lines.extend(schema_to_md(sub, depth))
        return lines

    if "oneOf" in node or "anyOf" in node:
        kw = "oneOf" if "oneOf" in node else "anyOf"
        lines = [f"{pad}- **{kw}:**"]
        for sub in node[kw]:
            lines.extend(schema_to_md(sub, depth + 1))
        return lines

    t = node.get("type")
    if t == "array":
        lines = [f"{pad}- array of:"]
        lines.extend(schema_to_md(node.get("items", {}), depth + 1))
        return lines
    props = node.get("properties", {})
    if t == "object" or props:
        if not props:
            return [f"{pad}- object"]
        req = set(node.get("required", []))
        lines = []
        for pname, pnode in props.items():
            req_mark = " *(required)*" if pname in req else ""
            desc = pnode.get("description") if isinstance(pnode, dict) else None
            lines.append(
                f"{pad}- `{pname}` **{type_label(pnode)}**{req_mark}"
                + (f" — {desc}" if desc else "")
            )
            if is_expandable(pnode):
                if pnode.get("type") == "array":
                    lines.extend(schema_to_md(pnode.get("items", {}), depth + 1))
                else:
                    lines.extend(schema_to_md(pnode, depth + 1))
        return lines

    return [f"{pad}- {type_label(node)}"]


def param_row(p):
    name = p.get("name", "?")
    loc = p.get("in", "?")
    req = "yes" if p.get("required") else "no"
    desc = (p.get("description") or "").replace("\n", " ").strip()
    sch = p.get("schema", {})
    typ = type_label(sch) if sch else ""
    return f"| `{name}` | {loc} | {req} | {typ} | {desc} |"


def schema_name(node):
    """Best-effort name for a schema node for linking."""
    name = ref_name(node)
    if name:
        return name
    if isinstance(node, dict):
        t = node.get("title")
        if t:
            return t
    return None


def request_body_md(op):
    rb = op.get("requestBody")
    if not rb:
        return None
    lines = ["### Request Body", ""]
    required_note = " *(all fields required)*" if rb.get("required") else " *(all fields optional)*"
    for ctype, cval in rb.get("content", {}).items():
        lines.append(f"**Content-Type:** `{ctype}`{required_note if ctype == 'application/json' else ''}")
        lines.append("")
        schema = cval.get("schema", {})
        name = schema_name(schema)
        if name and ref_name(schema):
            lines.append(schema_link(name))
        elif name:
            lines.append(f"**{name}**")
            lines.append("")
            lines.extend(schema_to_md(schema, 0))
        else:
            lines.extend(schema_to_md(schema, 0))
        lines.append("")
    return lines


def responses_md(op):
    lines = ["### Responses", ""]
    for code in sorted(op.get("responses", {})):
        r = op["responses"][code]
        desc = r.get("description", "")
        status = f"{code} {HTTP_STATUS_TEXT.get(code, '')}".strip()
        lines.append(f"#### {status}" + (f" — {desc}" if desc else ""))
        lines.append("")
        for ctype, cval in r.get("content", {}).items():
            lines.append(f"**Content-Type:** `{ctype}`")
            lines.append("")
            lines.extend(schema_to_md(cval.get("schema", {}), 0))
            lines.append("")
    return lines


def op_md(path, method, op, tag):
    op_id = op.get("operationId", "")
    lines = [f"# {op.get('summary') or op_id}", ""]
    lines.append(f"- **Operation ID:** `{op_id}`")
    lines.append(f"- **Endpoint:** `{method.upper()} {path}`")
    lines.append(f"- **Tag:** {tag}")
    security = op.get("security", spec.get("security", []))
    # An empty object in the security list means the operation is anonymously accessible
    anon_ok = any(isinstance(s, dict) and not s for s in security)
    if not security:
        auth = "None (public)"
    elif op.get("security") == [{"AccountToken": []}]:
        auth = "Account token (registration)"
    elif anon_ok:
        auth = "Anonymous or agent token"
    else:
        auth = "Agent token required"
    lines.append(f"- **Auth:** {auth}")
    lines.append("")
    desc = (op.get("description") or "").strip()
    if desc:
        lines.append(desc)
        lines.append("")
    params = op.get("parameters", [])
    if params:
        lines.append("### Parameters")
        lines.append("")
        lines.append("| Name | In | Required | Type | Description |")
        lines.append("|---|---|---|---|---|")
        for p in params:
            lines.append(param_row(p))
        lines.append("")
    rb = request_body_md(op)
    if rb:
        lines.extend(rb)
    lines.extend(responses_md(op))
    return lines


def write_file(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def main():
    tags_index = OrderedDict()

    for path, methods in spec.get("paths", {}).items():
        for method in METHOD_ORDER:
            if method not in methods:
                continue
            op = methods[method]
            tag = (op.get("tags") or ["Other"])[0]
            op_id = op.get("operationId", slug(f"{method} {path}"))
            fname = slug(op_id) + ".md"
            write_file(OUT / "routes" / tag / fname, "\n".join(op_md(path, method, op, tag)) + "\n")
            tags_index.setdefault(tag, []).append({
                "path": path,
                "method": method.upper(),
                "summary": op.get("summary", op_id),
                "file": f"routes/{tag}/{fname}",
            })

    schemas = spec.get("components", {}).get("schemas", {})
    for name, sch in schemas.items():
        lines = [f"# `{name}`", ""]
        desc = (sch.get("description") or "").strip()
        if desc:
            lines.append(desc)
            lines.append("")
        lines.append("## Properties")
        lines.append("")
        lines.extend(schema_to_md(sch, 0))
        lines.append("")
        write_file(OUT / "schemas" / f"{name}.md", "\n".join(lines))

    info = spec.get("info", {})
    lines = [
        "# SpaceTraders API — OpenAPI Reference",
        "",
        f"- **Spec version:** {spec.get('openapi')}",
        f"- **API version:** {info.get('version')}",
        f"- **Title:** {info.get('title')}",
        "- **Base URL:** https://api.spacetraders.io/v2",
        "- **Source:** https://api.spacetraders.io/v2/documentation/json",
        "",
        "## Overview",
        "",
        (info.get("description") or "").strip(),
        "",
        "## Route Index",
        "",
    ]
    for tag, entries in tags_index.items():
        lines.append(f"### {tag} ({len(entries)})")
        lines.append("")
        lines.append("| Method | Path | Summary | Doc |")
        lines.append("|---|---|---|---|")
        for e in entries:
            lines.append(f"| {e['method']} | `{e['path']}` | {e['summary']} | [link](./{e['file']}) |")
        lines.append("")
    lines.append("## Schemas")
    lines.append("")
    lines.append(f"{len(schemas)} component schemas under [`schemas/`](./schemas/):")
    lines.append("")
    for name in sorted(schemas):
        lines.append(f"- [`{name}`](./schemas/{name}.md)")
    lines.append("")
    write_file(OUT / "README.md", "\n".join(lines))

    total_routes = sum(len(v) for v in tags_index.values())
    print(f"Routes written: {total_routes}")
    print(f"Tags: {', '.join(tags_index)}")
    print(f"Schemas written: {len(schemas)}")


if __name__ == "__main__":
    main()
