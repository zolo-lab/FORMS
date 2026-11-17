import { Shell } from "@/components/shell";
import { SwRegister } from "@/components/sw-register";

export default function OfficerLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <SwRegister />
      {children}
    </Shell>
  );
}
