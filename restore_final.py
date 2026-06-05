import base64, json, urllib.request
url = "https://api.github.com/repos/chenkun983/eve-profit/git/blobs/52449706f12428698136abe90db80ec84bf43d00"
resp = urllib.request.urlopen(url)
data = json.loads(resp.read().decode())
b64 = data['content'].replace('\n', '').replace(' ', '')
# 补齐 padding
pad = 4 - len(b64) % 4
if pad != 4:
    b64 += '=' * pad
decoded = base64.b64decode(b64).decode('utf-8')
path = r'D:\agent_workspace\EVE国服服务器项目\static\auth.js'
with open(path, 'w', encoding='utf-8') as f:
    f.write(decoded)
print(f"OK: {len(decoded)} bytes written to {path}")
