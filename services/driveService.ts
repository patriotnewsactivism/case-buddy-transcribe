import { getAccessToken } from './googleAuthService';

// Type definitions for Google APIs
interface GooglePickerResponse {
  action: string;
  docs: Array<{
    id: string;
    name: string;
    mimeType: string;
  }>;
}

interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
}

interface DriveFilesResponse {
  files?: DriveFileMetadata[];
  nextPageToken?: string;
}


/**
 * Uploads a file to Google Drive using standard REST API (no gapi.client)
 * This is much more robust against initialization errors.
 */
export const uploadToDrive = async (
    folderName: string,
    fileName: string, 
    content: Blob | string,
    mimeType: string
): Promise<string> => {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
            throw new Error("User not signed in. Please sign in with Google to upload to Drive.");
        }

        // 1. Check for existing folder
        const folderQuery = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
        const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (!folderRes.ok) throw new Error("Failed to search Drive folders.");
        const folderData = await folderRes.json() as DriveFilesResponse;
        
        let folderId = '';
        if (folderData.files && folderData.files.length > 0) {
            folderId = folderData.files[0].id;
        } else {
            // Create folder
            const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder'
                })
            });
            if (!createRes.ok) throw new Error("Failed to create folder.");
            const createData = await createRes.json() as DriveFileMetadata;
            folderId = createData.id;
        }

        // 2. Upload File (Multipart)
        const metadata = {
            name: fileName,
            parents: [folderId]
        };

        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        
        const fileContent = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
        formData.append('file', fileContent);

        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: formData
        });

        if (!uploadRes.ok) {
            const err = await uploadRes.text();
            throw new Error(`Upload failed: ${err}`);
        }

        const result = await uploadRes.json() as DriveFileMetadata;
        return result.id;

    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error("Drive Upload Error:", error);
        throw new Error(`Drive upload failed: ${error.message}`);
    }
};

/**
 * Downloads a file content via fetch
 */
const downloadDriveFile = async (fileId: string, fileName: string, mimeType: string): Promise<File> => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        throw new Error("User not signed in.");
    }
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error("Failed to download file content");
    const blob = await res.blob();
    return new File([blob], fileName, { type: mimeType });
};

/**
 * Helper to recursively list files in folders
 */
const listFilesRecursive = async (folderId: string, apiKey: string, onProgress?: (msg: string) => void): Promise<File[]> => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        throw new Error("User not signed in.");
    }
    const filesFound: File[] = [];
    const query = `'${folderId}' in parents and (mimeType contains 'audio/' or mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder') and trashed = false`;
    let pageToken = null;

    do {
        const params = new URLSearchParams({
            q: query,
            fields: 'nextPageToken, files(id, name, mimeType)',
            key: apiKey
        });
        if (pageToken) params.append('pageToken', pageToken);

        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (!res.ok) break;
        const data = await res.json() as DriveFilesResponse;
        const files = data.files || [];

        for (const file of files) {
            if (file.mimeType === 'application/vnd.google-apps.folder') {
                if (onProgress) onProgress(`Scanning ${file.name}...`);
                const children = await listFilesRecursive(file.id, apiKey, onProgress);
                filesFound.push(...children);
            } else {
                if (onProgress) onProgress(`Downloading ${file.name}...`);
                filesFound.push(await downloadDriveFile(file.id, file.name, file.mimeType));
            }
        }
        pageToken = data.nextPageToken;
    } while (pageToken);

    return filesFound;
};

/**
 * Opens the Google Drive Picker
 */
export const openDrivePicker = async (
    apiKeyRaw: string, 
    onProgress?: (msg: string) => void
): Promise<File[]> => {
    const apiKey = apiKeyRaw?.trim();

    if (!apiKey) throw new Error("Missing API Key");

    if (onProgress) onProgress("Initializing...");
    
    const accessToken = getAccessToken();
    if (!accessToken) {
        throw new Error("Please sign in with Google first.");
    }

    return new Promise((resolve, reject) => {
        try {
            if (!window.gapi || !window.gapi.picker) {
                throw new Error("Picker API failed to load. Please disable ad blockers and try again.");
            }

            const view = new google.picker.DocsView()
                .setIncludeFolders(true)
                .setSelectFolderEnabled(true);

            const pickerBuilder = new google.picker.PickerBuilder()
                .setDeveloperKey(apiKey)
                .setOAuthToken(accessToken)
                .addView(view)
                .addView(google.picker.ViewId.DOCS_AUDIO)
                .addView(google.picker.ViewId.DOCS_VIDEO)
                .setCallback(async (data: GooglePickerResponse) => {
                    if (data.action === google.picker.Action.PICKED) {
                        const docs = data.docs;
                        const results: File[] = [];
                        try {
                            for (let i = 0; i < docs.length; i++) {
                                const doc = docs[i];
                                if (onProgress) onProgress(`Processing ${i+1}/${docs.length}: ${doc.name}`);
                                
                                if (doc.mimeType === 'application/vnd.google-apps.folder') {
                                    const children = await listFilesRecursive(doc.id, apiKey, onProgress);
                                    results.push(...children);
                                } else {
                                    results.push(await downloadDriveFile(doc.id, doc.name, doc.mimeType));
                                }
                            }
                            resolve(results);
                        } catch (e) {
                            const error = e instanceof Error ? e : new Error(String(e));
                            reject(new Error("Download failed: " + error.message));
                        }
                    } else if (data.action === google.picker.Action.CANCEL) {
                        resolve([]);
                    }
                });

            const picker = pickerBuilder.build();
            picker.setVisible(true);

        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            reject(new Error("Failed to build picker: " + error.message));
        }
    });
};