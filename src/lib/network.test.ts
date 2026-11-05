import { expect,it } from "vitest";
import { publicUrl } from "./network";
it.each(["http://127.0.0.1","http://10.1.2.3","http://169.254.169.254","http://172.16.1.1","http://192.168.0.1","http://[::1]","http://[::ffff:127.0.0.1]","file:///etc/passwd","https://user:pass@example.com","https://example.com:1234"])("blocks unsafe destinations %s",async value=>{await expect(publicUrl(value)).rejects.toThrow();});
it("accepts public IP destinations",async()=>{expect((await publicUrl("https://1.1.1.1/path")).pathname).toBe("/path");});
