import type { AvatarService } from "./interfaces";
import { getAdminClient } from "@/lib/supabase/admin";

class SupabaseAvatarService implements AvatarService {
    private get db() {
        const client = getAdminClient();
        if (!client) throw new Error("Supabase admin client not configured");
        return client;
    }

    async uploadAvatar(
        userId: string,
        file: File,
    ): Promise<{ avatarUrl: string }> {
        const ext =
            file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
        const filePath = `${userId}.${ext}`;

        const buffer = Buffer.from(await file.arrayBuffer());

        const { error: uploadError } = await this.db.storage
            .from("avatars")
            .upload(filePath, buffer, {
                contentType: file.type,
                upsert: true,
            });

        if (uploadError) {
            throw new Error(`Avatar upload failed: ${uploadError.message}`);
        }

        const { data: publicUrlData } = this.db.storage
            .from("avatars")
            .getPublicUrl(filePath);

        const avatarUrl = publicUrlData.publicUrl;

        const { error: dbError } = await this.db
            .from("profiles")
            .update({ avatar_url: avatarUrl })
            .eq("id", userId);

        if (dbError) {
            throw new Error(`Profile update failed: ${dbError.message}`);
        }

        return { avatarUrl };
    }

    async deleteAvatar(userId: string): Promise<void> {
        const { data: files } = await this.db.storage.from("avatars").list("", {
            search: userId,
        });

        if (files && files.length > 0) {
            await this.db.storage
                .from("avatars")
                .remove(files.map((f) => f.name));
        }

        await this.db
            .from("profiles")
            .update({ avatar_url: "" })
            .eq("id", userId);
    }
}

export const avatarService: AvatarService = new SupabaseAvatarService();
