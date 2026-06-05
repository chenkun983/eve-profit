import os
os.chdir(r'D:\agent_workspace\EVE国服服务器项目')
with os.popen('git log --oneline -10') as f:
    print(f.read())
