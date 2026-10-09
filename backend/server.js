// Ishga tushirish: npm run dev (kompyuterda) yoki cPanel → Setup Node.js App (serverda, "Application startup file": server.js)
import app from "./src/app.js";
import { migrate } from "./src/db.js";

const port = process.env.PORT || 4000;
await migrate();
app.listen(port, () => console.log(`API ishga tushdi: http://localhost:${port}/api/health`));
