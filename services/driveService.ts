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
 * Uploads a file to Google Drive using standard REST API.
 */
export const uploadToDrive = async (
    folderName: string,
    fileName: string, 
    content: Blob | string,
    mimeType: string
): Promise<string> => {
    try {
        const accessToken = getAccessToken();
        if (!accessToken) {
            throw new Error("Sign-in required for Drive upload.");
        }

        const folderQuery = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
        const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (!folderRes.ok) throw new Error("Search failed.");
        const folderData = await folderRes.json() as DriveFilesResponse;
        
        let folderId = '';
        if (folderData.files && folderData.files.length > 0) {
            folderId = folderData.files[0].id;
        } else {
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
            if (!createRes.ok) throw new Error("Folder creation failed.");
            const createData = await createRes.json() as DriveFileMetadata;
            folderId = createData.id;
        }

        const metadata = { name: fileName, parents: [folderId] };
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        const fileContent = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
        formData.append('file', fileContent);

        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: formData
        });

        if (!uploadRes.ok) throw new Error("Upload failed.");
        const result = await uploadRes.json() as DriveFileMetadata;
        return result.id;
    } catch (e) {
        throw e;
    }
};

const downloadDriveFile = async (fileId: string, fileName: string, mimeType: string): Promise<File> => {
    const accessToken = getAccessToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error("Download failed.");
    const blob = await res.blob();
    return new File([blob], fileName, { type: mimeType });
};

const listFilesRecursive = async (folderId: string, apiKey: string, onProgress?: (msg: string) => void): Promise<File[]> => {
    const accessToken = getAccessToken();
    const filesFound: File[] = [];
    const query = `'${folderId}' in parents and (mimeType contains 'audio/' or mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder') and trashed = false`;
    let pageToken = null;

    do {
        const params = new URLSearchParams({ q: query, fields: 'nextPageToken, files(id, name, mimeType)', key: apiKey });
        if (pageToken) params.append('pageToken', pageToken);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) break;
        const data = await res.json() as DriveFilesResponse;
        const files = data.files || [];
        for (const file of files) {
            if (file.mimeType === 'application/vnd.google-apps.folder') {
                const children = await listFilesRecursive(file.id, apiKey, onProgress);
                filesFound.push(...children);
            } else {
                filesFound.push(await downloadDriveFile(file.id, file.name, file.mimeType));
            }
        }
        pageToken = data.nextPageToken;
    } while (pageToken);
    return filesFound;
};

export const openDrivePicker = async (apiKey: string, onProgress?: (msg: string) => void): Promise<File[]> => {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error("Please sign in with Google first.");

    return new Promise((resolve, reject) => {
        try {
            if (!window.gapi || !window.gapi.picker) throw new Error("Picker not loaded.");

            const view = new google.picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(true);
            const pickerBuilder = new google.picker.PickerBuilder()
                .setDeveloperKey(apiKey)
                .setOAuthToken(accessToken)
                .addView(view)
                .addView(google.picker.ViewId.DOCS_AUDIO)
                .addView(google.picker.ViewId.DOCS_VIDEO)
                .setCallback(async (data: GooglePickerResponse) => {
                    if (data.action === google.picker.Action.PICKED) {
                        const results: File[] = [];
                        for (const doc of data.docs) {
                            if (doc.mimeType === 'application/vnd.google-apps.folder') {
                                results.push(...(await listFilesRecursive(doc.id, apiKey, onProgress)));
                            } else {
                                results.push(await downloadDriveFile(doc.id, doc.name, doc.mimeType));
                            }
                        }
                        resolve(results);
                    } else if (data.action === google.picker.Action.CANCEL) {
                        resolve([]);
                    }
                });

            pickerBuilder.build().setVisible(true);
        } catch (e) {
            reject(e);
        }
    });
};
