import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const dureeCacheUrl = 45 * 60 * 1000;
const cacheUrl = new Map<string, { url: string; expire: number }>();

interface MemberAvatarProps {
  nom: string;
  photoPath?: string | null;
  className?: string;
}

function initiales(nom: string): string {
  return nom.trim().split(/\s+/).slice(0, 2)
    .map((partie) => partie[0]?.toLocaleUpperCase("fr") ?? "")
    .join("");
}

export function MemberAvatar({ nom, photoPath, className = "" }: MemberAvatarProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    if (!photoPath || !supabase) return () => { active = false; };

    const cached = cacheUrl.get(photoPath);
    if (cached && cached.expire > Date.now()) {
      setUrl(cached.url);
      return () => { active = false; };
    }

    void supabase.storage.from("member-photos").createSignedUrl(photoPath, 60 * 60)
      .then(({ data, error }) => {
        if (error) throw error;
        if (!data?.signedUrl) throw new Error("Supabase n’a pas retourné de lien pour la photo.");
        cacheUrl.set(photoPath, { url: data.signedUrl, expire: Date.now() + dureeCacheUrl });
        if (active) setUrl(data.signedUrl);
      })
      .catch((error: unknown) => {
        console.error("Chargement de la photo du membre impossible.", error);
      });

    return () => { active = false; };
  }, [photoPath]);

  return url ? (
    <img className={`member-avatar ${className}`.trim()} src={url} alt={`Photo de ${nom}`} />
  ) : (
    <span className={`member-avatar ${className}`.trim()} role="img" aria-label={`Initiales de ${nom}`}>
      {initiales(nom)}
    </span>
  );
}
