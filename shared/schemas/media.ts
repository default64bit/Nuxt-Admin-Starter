/** A staged upload as `POST /api/v1/admin/media` answers it. */
export interface UploadedMedia {
  id: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  /** Admin-only preview of the staged (private) object. */
  previewUrl: string;
}

/** `GET /api/v1/admin/media/status`: whether media storage is configured, and the upload limit. */
export interface MediaStatus {
  enabled: boolean;
  maxBytes: number;
}
