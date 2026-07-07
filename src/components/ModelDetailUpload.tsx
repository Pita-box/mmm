"use client";

import { MediaUploadLauncher } from "./MediaUploadLauncher";
import type { ModelOption } from "./admin/upload-wizard";

export interface ModelDetailUploadProps {
  readonly model: ModelOption;
  readonly tagSuggestions?: Partial<Record<string, string[]>>;
}

export function ModelDetailUpload({
  model,
  tagSuggestions = {},
}: ModelDetailUploadProps) {
  return (
    <MediaUploadLauncher
      models={[model]}
      tagSuggestions={tagSuggestions}
      initialModelId={model.id}
      lockModelSelection
    />
  );
}

export default ModelDetailUpload;
