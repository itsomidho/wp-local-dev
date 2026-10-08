#!/usr/bin/env python3
"""Fails if a style rule is nested inside another style rule.

The dashboard's CSS doesn't use nesting on purpose -- so a rule that ends up
inside another one means a lost closing brace, which every rule after it then
silently inherits (nested CSS is valid, so the build won't complain). That
once left every style below a merge-conflict fix dead in the dashboard.
Nesting inside at-rules (@media, @supports, @keyframes...) is fine.
"""
import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "src/index.css"
text = open(path, encoding="utf-8").read()
# Blank out comments and strings, keeping line numbers.
text = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group()), text, flags=re.S)
text = re.sub(r"'[^'\n]*'|\"[^\"\n]*\"", lambda m: " " * len(m.group()), text)

stack = []  # (kind, selector, line) per open block
prelude_start = 0
errors = []
for i, ch in enumerate(text):
    if ch == "{":
        prelude = text[prelude_start:i].strip()
        line = text.count("\n", 0, i) + 1
        kind = "at" if prelude.startswith("@") else "style"
        if kind == "style" and stack and stack[-1][0] == "style":
            outer = stack[-1]
            errors.append(f"{path}:{line}: '{prelude[:60]}' is nested inside '{outer[1][:60]}' (opened at line {outer[2]}) -- missing '}}'?")
        stack.append((kind, prelude, line))
        prelude_start = i + 1
    elif ch == "}":
        if stack:
            stack.pop()
        prelude_start = i + 1
    elif ch == ";":
        prelude_start = i + 1

if stack:
    kind, sel, line = stack[-1]
    errors.append(f"{path}:{line}: '{sel[:60]}' is never closed")
for e in errors[:5]:
    print(e)
sys.exit(1 if errors else 0)
