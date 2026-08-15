from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
tag='<link rel="stylesheet" href="styles/maurimove-identity.css">'
if tag not in s:
    s=s.replace('</head>',tag+'</head>',1)
p.write_text(s,encoding='utf-8')
print('identity stylesheet linked')
