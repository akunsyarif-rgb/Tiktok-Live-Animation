import { generateSigningKeys } from "../src/lib/sign.ts";
console.log(JSON.stringify(await generateSigningKeys()));
