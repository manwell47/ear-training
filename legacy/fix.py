
lines = open('C:/APPs/Ear Training/src/web/App.js', 'r', encoding='utf-8').readlines()
backtick = chr(96)
for i, line in enumerate(lines):
    if 'muteBtn.className = ' + backtick + 'btn btn-sm ' + backtick + ';' in line:
        lines[i] = '        muteBtn.className = ' + backtick + 'btn btn-sm ' + backtick + ';\n'
    elif 'soloBtn.className = ' + backtick + 'btn btn-sm ' + backtick + ';' in line:
        lines[i] = '        soloBtn.className = ' + backtick + 'btn btn-sm ' + backtick + ';\n'
open('C:/APPs/Ear Training/src/web/App.js', 'w', encoding='utf-8').write(''.join(lines))

