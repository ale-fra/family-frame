import * as React from "react";
import type { AdminPhoto, PhotoStatus } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { UploadDropzone } from "./UploadDropzone";
import { PhotoCard } from "./PhotoCard";
import { adminTabs, emptyAdminText, emptyAdminTitle } from "./labels";
import { Inbox } from "lucide-react";

type Props = {
  photos: AdminPhoto[];
  counts: Record<PhotoStatus, number>;
  activeTab: PhotoStatus;
  onTabChange: (status: PhotoStatus) => void;
  busy: boolean;
  onUpload: (files: File[]) => void;
  onUpdateStatus: (photo: AdminPhoto, status: PhotoStatus) => void;
};

export function PhotosSection({
  photos,
  counts,
  activeTab,
  onTabChange,
  busy,
  onUpload,
  onUpdateStatus
}: Props) {
  const visible = photos.filter((photo) => photo.status === activeTab);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Carica foto</CardTitle>
          <CardDescription>
            Le immagini caricate entrano sempre nella coda <em>Da approvare</em>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadDropzone busy={busy} onFiles={onUpload} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle>Libreria</CardTitle>
            <CardDescription>
              Approva, nascondi o cestina le foto. Le modifiche sono immediate.
            </CardDescription>
          </div>
          <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as PhotoStatus)}>
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
              {adminTabs.map((tab) => (
                <TabsTrigger key={tab.status} value={tab.status} className="gap-2">
                  <span>{tab.label}</span>
                  <Badge
                    variant={activeTab === tab.status ? "default" : "secondary"}
                    className="px-1.5 py-0 text-[10px]"
                  >
                    {counts[tab.status]}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {visible.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  busy={busy}
                  onApprove={() => onUpdateStatus(photo, "approved")}
                  onHide={() => onUpdateStatus(photo, "hidden")}
                  onTrash={() => onUpdateStatus(photo, "trashed")}
                  onRestore={() => onUpdateStatus(photo, "hidden")}
                />
              ))}
            </div>
          ) : (
            <EmptyState status={activeTab} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ status }: { status: PhotoStatus }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/30 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background text-muted-foreground">
        <Inbox className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{emptyAdminTitle(status)}</p>
        <p className="max-w-xs text-xs text-muted-foreground">{emptyAdminText(status)}</p>
      </div>
    </div>
  );
}
