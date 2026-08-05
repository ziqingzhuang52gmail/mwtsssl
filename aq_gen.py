# ============================================================
# 阿庆工具 — 发包命令生成器 v3.0
# 粘贴协议日志，回车即解析并自动复制 go() 到剪贴板
# 切到浏览器控制台 Ctrl+V 回车直接发包
# ============================================================
import re
import json
import sys
import subprocess


def copy_to_clipboard(text):
    """复制文本到剪贴板（Windows ctypes，支持 Unicode）"""
    try:
        import ctypes
        CF_UNICODETEXT = 13
        GMEM_MOVEABLE = 0x0002
        u = ctypes.windll.user32
        k = ctypes.windll.kernel32
        # 64位 Python 必须设置正确的参数和返回类型
        k.GlobalAlloc.restype = ctypes.c_void_p
        k.GlobalAlloc.argtypes = [ctypes.c_uint, ctypes.c_size_t]
        k.GlobalLock.restype = ctypes.c_void_p
        k.GlobalLock.argtypes = [ctypes.c_void_p]
        k.GlobalUnlock.argtypes = [ctypes.c_void_p]
        u.SetClipboardData.restype = ctypes.c_void_p
        u.SetClipboardData.argtypes = [ctypes.c_uint, ctypes.c_void_p]
        u.OpenClipboard(0)
        u.EmptyClipboard()
        data = (text + '\0').encode('utf-16-le')
        h = k.GlobalAlloc(GMEM_MOVEABLE, len(data))
        if h:
            p = k.GlobalLock(h)
            ctypes.memmove(p, data, len(data))
            k.GlobalUnlock(h)
            u.SetClipboardData(CF_UNICODETEXT, h)
        u.CloseClipboard()
        return True
    except Exception:
        try:
            subprocess.run(['clip'], input=text, encoding='utf-8', check=False)
            return True
        except Exception:
            return False


def parse_line(text):
    """从文本中提取 mod, cmd, data"""
    flat = re.sub(r'\s+', ' ', text).strip()

    # 格式1: SocketMgr.ActivityProxy(18).GetCommonReward(13)
    m = re.search(r'(\w+)\((\d+)\)\.(\w+)\((\d+)\)', flat)
    if m:
        mod = m.group(2)
        cmd = m.group(4)
    else:
        # 格式2: GetCommonReward(13) 来自 ActivityProxy(18)
        m2 = re.search(r'(\w+)\((\d+)\)\s*来自\s*(\w+)\((\d+)\)', flat)
        if m2:
            cmd = m2.group(2)
            mod = m2.group(4)
        else:
            return None, None, None

    # 提取 data
    data_match = re.search(r'\{.*\}', flat)
    if data_match:
        data_str = data_match.group(0)
    else:
        data_str = '{}'

    return mod, cmd, data_str


def json_to_js(data_str):
    """将 JSON 字符串转成 JS 对象字面量"""
    try:
        obj = json.loads(data_str)
    except json.JSONDecodeError:
        fixed = data_str
        fixed = re.sub(r"'([^']*)'", r'"\1"', fixed)
        fixed = re.sub(r'(\w+)\s*:', r'"\1":', fixed)
        try:
            obj = json.loads(fixed)
        except json.JSONDecodeError:
            return data_str

    parts = []
    for k, v in obj.items():
        if isinstance(v, str):
            parts.append(f"{k}: '{v}'")
        elif isinstance(v, bool):
            parts.append(f"{k}: {str(v).lower()}")
        elif v is None:
            parts.append(f"{k}: null")
        elif isinstance(v, (dict, list)):
            parts.append(f"{k}: {json.dumps(v, ensure_ascii=False)}")
        else:
            parts.append(f"{k}: {v}")
    return '{' + ', '.join(parts) + '}'


def main():
    print("=" * 55)
    print("  阿庆工具 v3.0 — 粘贴回车，自动复制到剪贴板")
    print("=" * 55)
    print()
    print("  粘贴协议行 → 回车 → 去控制台 Ctrl+V 回车发包")
    print("  ─────────────────────────────────────")
    print()

    while True:
        try:
            line = input("📌> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not line:
            continue
        if line.lower() in ("exit", "quit", "q"):
            break
        if line.lower() == "clear":
            subprocess.run(['cls'] if sys.platform == 'win32' else ['clear'], shell=True)
            continue

        mod, cmd, data_str = parse_line(line)

        if mod and cmd:
            js_data = json_to_js(data_str)
            cmd_str = f"go({mod}, {cmd}, {js_data})"
            if copy_to_clipboard(cmd_str):
                print(f"  ✅ {cmd_str}")
                print(f"  📋 已复制到剪贴板 → 去控制台 Ctrl+V 回车")
            else:
                print(f"  ✅ {cmd_str}")
                print(f"  ⚠️ 剪贴板复制失败，请手动复制上面这行")
            print()
        else:
            print(f"  ❌ 无法解析")
            print(f"  格式: [C2S] SocketMgr.ActivityProxy(18).GetCommonReward(13) {{code:'1009107'}}")
            print()


if __name__ == "__main__":
    main()
