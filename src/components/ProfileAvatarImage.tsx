"use client";

import { useEffect, useState } from "react";
import type { ProfileAvatarCropInput, ProfileAvatarPercentCrop } from "@/lib/profile-avatar";
import {
  normalizeProfileAvatarPercentCrop,
  profileAvatarPercentCropFromStored,
} from "@/lib/profile-avatar";

export interface ProfileAvatarImageProps {
  readonly src?: string;
  readonly alt: string;
  readonly crop?: ProfileAvatarCropInput | null;
  readonly percentCrop?: ProfileAvatarPercentCrop;
  readonly className?: string;
}

function toPixelCrop(
  crop: ProfileAvatarPercentCrop,
  naturalWidth: number,
  naturalHeight: number,
) {
  return {
    x: (crop.x / 100) * naturalWidth,
    y: (crop.y / 100) * naturalHeight,
    width: (crop.width / 100) * naturalWidth,
    height: (crop.height / 100) * naturalHeight,
  };
}

export function ProfileAvatarImage({
  src,
  alt,
  crop,
  percentCrop,
  className = "",
}: ProfileAvatarImageProps) {
  const [avatarSrc, setAvatarSrc] = useState<string | undefined>(src);

  useEffect(() => {
    if (!src) {
      setAvatarSrc(undefined);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      const resolvedCrop =
        percentCrop ??
        profileAvatarPercentCropFromStored(crop, {
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      const pixelCrop = toPixelCrop(
        normalizeProfileAvatarPercentCrop(resolvedCrop, {
          width: image.naturalWidth,
          height: image.naturalHeight,
        }),
        image.naturalWidth,
        image.naturalHeight,
      );
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setAvatarSrc(src);
        return;
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      setAvatarSrc(canvas.toDataURL("image/jpeg", 0.92));
    };
    image.onerror = () => {
      if (!cancelled) setAvatarSrc(src);
    };
    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [src, crop, percentCrop]);

  if (!avatarSrc) return null;

  // eslint-disable-next-line @next/next/no-img-element -- klientský canvas preview / proxy thumb
  return <img src={avatarSrc} alt={alt} className={className} />;
}
