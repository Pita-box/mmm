export interface ProfileAvatarCropInput {
  readonly avatarCropX?: number | null;
  readonly avatarCropY?: number | null;
  readonly avatarZoom?: number | null;
}

export interface ProfileAvatarImageMetrics {
  readonly width: number;
  readonly height: number;
}

export interface ProfileAvatarPercentCrop {
  readonly unit: "%";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const LEGACY_MAX = 4;
const DEFAULT_WIDTH = 80;
const MIN_WIDTH = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isValidMetrics(metrics: ProfileAvatarImageMetrics): boolean {
  return metrics.width > 0 && metrics.height > 0;
}

function maxSquareWidthPercent(metrics: ProfileAvatarImageMetrics): number {
  if (!isValidMetrics(metrics)) return 100;
  return clamp((metrics.height / metrics.width) * 100, 0, 100);
}

function heightPercentFromWidthPercent(
  widthPercent: number,
  metrics: ProfileAvatarImageMetrics,
): number {
  if (!isValidMetrics(metrics)) return widthPercent;
  return widthPercent * (metrics.width / metrics.height);
}

function clampPercentCrop(
  crop: { x: number; y: number; width: number },
  metrics: ProfileAvatarImageMetrics,
): ProfileAvatarPercentCrop {
  const maxWidth = maxSquareWidthPercent(metrics);
  const width = clamp(crop.width, Math.min(MIN_WIDTH, maxWidth), maxWidth);
  const height = heightPercentFromWidthPercent(width, metrics);
  return {
    unit: "%",
    x: clamp(crop.x, 0, 100 - width),
    y: clamp(crop.y, 0, 100 - height),
    width,
    height,
  };
}

export function defaultProfileAvatarPercentCrop(
  metrics: ProfileAvatarImageMetrics,
): ProfileAvatarPercentCrop {
  const width = Math.min(DEFAULT_WIDTH, maxSquareWidthPercent(metrics));
  const height = heightPercentFromWidthPercent(width, metrics);
  return {
    unit: "%",
    x: (100 - width) / 2,
    y: (100 - height) / 2,
    width,
    height,
  };
}

function percentCropFromLegacyStored(
  input: ProfileAvatarCropInput | null | undefined,
  metrics: ProfileAvatarImageMetrics,
): ProfileAvatarPercentCrop {
  const centerX = clamp(input?.avatarCropX ?? 50, 0, 100);
  const centerY = clamp(input?.avatarCropY ?? 35, 0, 100);
  const zoom = clamp(input?.avatarZoom ?? 1, 1, 3);

  let width = 100 / zoom;
  if (isValidMetrics(metrics) && metrics.width > metrics.height) {
    width *= metrics.height / metrics.width;
  }

  const height = heightPercentFromWidthPercent(width, metrics);
  return clampPercentCrop(
    {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
    },
    metrics,
  );
}

export function profileAvatarPercentCropFromStored(
  input: ProfileAvatarCropInput | null | undefined,
  metrics: ProfileAvatarImageMetrics,
): ProfileAvatarPercentCrop {
  if (input?.avatarZoom == null) return defaultProfileAvatarPercentCrop(metrics);
  if (input.avatarZoom <= LEGACY_MAX) return percentCropFromLegacyStored(input, metrics);
  return clampPercentCrop(
    {
      x: input.avatarCropX ?? 0,
      y: input.avatarCropY ?? 0,
      width: input.avatarZoom,
    },
    metrics,
  );
}

export function normalizeStoredProfileAvatarCrop(
  input: ProfileAvatarCropInput | null | undefined,
  metrics: ProfileAvatarImageMetrics,
): Required<ProfileAvatarCropInput> {
  const crop = clampPercentCrop(
    {
      x: input?.avatarCropX ?? 0,
      y: input?.avatarCropY ?? 0,
      width: input?.avatarZoom ?? DEFAULT_WIDTH,
    },
    metrics,
  );
  return {
    avatarCropX: crop.x,
    avatarCropY: crop.y,
    avatarZoom: crop.width,
  };
}

export function profileAvatarStoredFromPercentCrop(
  crop: { x?: number; y?: number; width?: number; height?: number } | null | undefined,
  metrics: ProfileAvatarImageMetrics,
): Required<ProfileAvatarCropInput> {
  return normalizeStoredProfileAvatarCrop(
    {
      avatarCropX: crop?.x ?? defaultProfileAvatarPercentCrop(metrics).x,
      avatarCropY: crop?.y ?? defaultProfileAvatarPercentCrop(metrics).y,
      avatarZoom: crop?.width ?? defaultProfileAvatarPercentCrop(metrics).width,
    },
    metrics,
  );
}

export function normalizeProfileAvatarPercentCrop(
  crop: { x?: number; y?: number; width?: number; height?: number } | null | undefined,
  metrics: ProfileAvatarImageMetrics,
): ProfileAvatarPercentCrop {
  return clampPercentCrop(
    {
      x: crop?.x ?? defaultProfileAvatarPercentCrop(metrics).x,
      y: crop?.y ?? defaultProfileAvatarPercentCrop(metrics).y,
      width: crop?.width ?? defaultProfileAvatarPercentCrop(metrics).width,
    },
    metrics,
  );
}

export function profileAvatarPreviewImageStyle(
  crop: ProfileAvatarPercentCrop,
): {
  readonly left: string;
  readonly top: string;
  readonly width: string;
  readonly height: string;
} {
  const scaleX = 100 / crop.width;
  const scaleY = 100 / crop.height;
  return {
    left: `${-crop.x * scaleX}%`,
    top: `${-crop.y * scaleY}%`,
    width: `${scaleX * 100}%`,
    height: `${scaleY * 100}%`,
  };
}
