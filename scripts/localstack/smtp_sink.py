"""Local SMTP sink: stores every email Supabase Auth sends as a file (dev/tests only)."""
import asyncore, os, smtpd, sys, time, warnings
warnings.filterwarnings("ignore")
OUT = sys.argv[1]
PORT = int(sys.argv[2])
os.makedirs(OUT, exist_ok=True)

class Sink(smtpd.SMTPServer):
    def process_message(self, peer, mailfrom, rcpttos, data, **kw):
        body = data.decode("utf-8", "replace") if isinstance(data, bytes) else data
        name = f"{time.time():.6f}_{rcpttos[0].replace('@', '_at_')}.eml"
        with open(os.path.join(OUT, name), "w") as f:
            f.write(body)

Sink(("127.0.0.1", PORT), None, decode_data=False)
asyncore.loop()
