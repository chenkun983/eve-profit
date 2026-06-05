import base64, json, re
# 从 web_fetch 结果中提取 base64
# 手动拼接完整的 base64（从 GitHub API 响应中获取）
# 这部分需要从 JSON 响应的 content 字段提取
b64_complete = ""
# API 返回的 content 字段（去除 \n 换行标记）
with open(r'D:\agent_workspace\EVE国服服务器项目\static\auth.js', 'r', encoding='utf-8') as f:
    content = f.read()
# 如果文件太小（被覆盖了），从 API 重建
if len(content) < 1000:
    print("文件损坏，需要从 API 恢复")
    import urllib.request
    url = "https://api.github.com/repos/chenkun983/eve-profit/git/blobs/52449706f12428698136abe90db80ec84bf43d00"
    resp = urllib.request.urlopen(url)
    data = json.loads(resp.read())
    b64 = data['content'].replace('\n', '')
    decoded = base64.b64decode(b64).decode('utf-8')
    with open(r'D:\agent_workspace\EVE国服服务器项目\static\auth.js', 'w', encoding='utf-8') as f2:
        f2.write(decoded)
    print(f"已恢复，{len(decoded)} 字节")
else:
    print(f"文件正常，{len(content)} 字节")
