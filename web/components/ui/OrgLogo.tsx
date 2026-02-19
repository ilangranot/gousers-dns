"use client";
import { useEffect, useState } from "react";
import GoUsersLogo from "./GoUsersLogo";
import { getOrgLogo } from "@/lib/api";

interface Props {
  size?: "sm" | "md" | "lg";
}

const HEIGHTS = { sm: 28, md: 36, lg: 48 };

export default function OrgLogo({ size = "md" }: Props) {
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    getOrgLogo()
      .then((d: any) => { if (d?.logo_base64) setLogo(d.logo_base64); })
      .catch(() => {});
  }, []);

  if (logo) {
    return (
      <img
        src={logo}
        alt="Organization logo"
        style={{ height: HEIGHTS[size], maxWidth: 160 }}
        className="object-contain"
      />
    );
  }

  return <GoUsersLogo size={size} />;
}
