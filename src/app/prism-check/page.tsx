import { PrismCheckClient } from "./PrismCheckClient";

export const metadata = { title: "PRISM check", robots: { index: false, follow: false } };

export default function PrismCheckPage() {
  return <PrismCheckClient />;
}
