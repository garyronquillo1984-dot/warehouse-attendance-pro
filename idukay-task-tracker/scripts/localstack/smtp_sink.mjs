// Local SMTP sink: stores every e-mail Supabase Auth sends as a file (dev/tests only).
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const [OUT, PORT] = [process.argv[2], Number(process.argv[3] || 2525)];
fs.mkdirSync(OUT, { recursive: true });

net.createServer(sock => {
  let buf = '', inData = false, rcpt = 'unknown', data = [];
  const say = s => sock.write(s + '\r\n');
  say('220 localhost ESMTP sink');
  sock.on('data', chunk => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (inData) {
        if (line === '.') {
          inData = false;
          fs.writeFileSync(path.join(OUT, `${(Date.now() / 1000).toFixed(6)}_${rcpt.replace('@', '_at_')}.eml`), data.join('\n'));
          data = []; say('250 OK');
        } else data.push(line.startsWith('..') ? line.slice(1) : line);
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO' || cmd === 'HELO') say('250 localhost');
      else if (cmd === 'MAIL') say('250 OK');
      else if (cmd === 'RCPT') { rcpt = (line.match(/<([^>]+)>/) ?? [, 'unknown'])[1]; say('250 OK'); }
      else if (cmd === 'DATA') { inData = true; say('354 End data with <CR><LF>.<CR><LF>'); }
      else if (cmd === 'QUIT') { say('221 Bye'); sock.end(); }
      else say('250 OK');
    }
  });
  sock.on('error', () => {});
}).listen(PORT, '127.0.0.1', () => console.log(`smtp sink on :${PORT}`));
