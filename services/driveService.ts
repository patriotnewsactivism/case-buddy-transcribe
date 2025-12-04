// @ts-nocheck
// We suppress TS checks here because gapi/google types are loaded dynamically

const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

let gapiInited = false;
let gisInited = false;
let tokenClient: any = null;

/**
 * Dynamically loads the Google API scripts
 */
export const loadGoogleScripts = () => {
  return new Promise<void>((resolve) => {
    if (window.gapi && window.google) {
        resolve();
        return;
    }

    const script1 = document.createElement('script');
    script1.src = 'https://apis.google.com/js/api.js';
    script1.async = true;
    script1.defer = true;
    script1.onload = () => {
        gapi.load('client:picker', async () => {
            gapiInited = true;
            if (gisInited) resolve();
        });
    };
    document.body.appendChild(script1);

    const script2 = document.createElement('script');
    script2.src = 'https://accounts.google.com/gsi/client';
    script2.async = true;
    script2.defer = true;
    script2.onload = () => {
        gisInited = true;
        if (gapiInited) resolve();
    };
    document.body.appendChild(script2);
  });
};

/**
 * Initializes the API client
 */
export const initGoogleClient = async (clientId: string, apiKey: string) => {
    if (!clientId) throw new Error("Google Client ID is required.");
    
    await new Promise<void>((resolve, reject) => {
        gapi.client.init({
            apiKey: apiKey,
            discoveryDocs: DISCOVERY_DOCS,
        }).then(() => {
            resolve();
        }, (error) => {
            reject(error);
        });
    });

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: '', // defined at request time
    });
};

/**
 * Downloads a file from Drive and converts it to a standard File object
 */
const downloadDriveFile = async (fileId: string, fileName: string, mimeType: string): Promise<File> => {
    try {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media',
        });
        
        // GAPI returns body in .body, we need to convert to Blob
        // Note: gapi.client.drive.files.get with alt=media returns the raw body string in some versions,
        // but robust handling requires fetch if gapi behaves oddly with binary.
        // Let's use the access token to fetch directly for binary safety.
        
        const token = gapi.client.getToken().access_token;
        const fetchRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        const blob = await fetchRes.blob();
        return new File([blob], fileName, { type: mimeType });
    } catch (e) {
        console.error("Error downloading drive file", e);
        throw e;
    }
};

/**
 * Recursively lists audio/video files in a folder
 */
const listFilesRecursive = async (folderId: string): Promise<File[]> => {
    const filesFound: File[] = [];
    
    // Query: (is audio OR is video OR is folder) AND not trashed AND parent = folderId
    const query = `'${folderId}' in parents and (mimeType contains 'audio/' or mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder') and trashed = false`;
    
    let pageToken = null;
    
    do {
        const response = await gapi.client.drive.files.list({
            q: query,
            fields: 'nextPageToken, files(id, name, mimeType)',
            pageToken: pageToken
        });
        
        const files = response.result.files;
        if (!files) break;

        for (const file of files) {
            if (file.mimeType === 'application/vnd.google-apps.folder') {
                // Recursive call
                const children = await listFilesRecursive(file.id);
                filesFound.push(...children);
            } else {
                // It's a media file, download it
                // NOTE: In a real "VM" scenario we might pass the URL. 
                // Here we download to memory to ensure the "Smart Engine" can process it.
                const downloadedFile = await downloadDriveFile(file.id, file.name, file.mimeType);
                filesFound.push(downloadedFile);
            }
        }
        
        pageToken = response.result.nextPageToken;
    } while (pageToken);

    return filesFound;
};

/**
 * Opens the Google Drive Picker
 */
export const openDrivePicker = (clientId: string, apiKey: string): Promise<File[]> => {
    return new Promise((resolve, reject) => {
        // 1. Ensure scripts loaded
        loadGoogleScripts().then(async () => {
            try {
                // 2. Init Client if needed
                if (!tokenClient) {
                    await initGoogleClient(clientId, apiKey);
                }

                // 3. Request Token
                tokenClient.callback = async (resp) => {
                    if (resp.error !== undefined) {
                        reject(resp);
                        throw (resp);
                    }
                    
                    // 4. Create Picker
                    const picker = new google.picker.PickerBuilder()
                        .setDeveloperKey(apiKey)
                        .setAppId(clientId)
                        .setOAuthToken(resp.access_token)
                        .addView(new google.picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(true))
                        .addView(google.picker.ViewId.DOCS_AUDIO)
                        .addView(google.picker.ViewId.DOCS_VIDEO)
                        .setCallback(async (data) => {
                            if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
                                const docs = data[google.picker.Response.DOCUMENTS];
                                const results: File[] = [];
                                
                                // Show some UI loading state potentially? 
                                // For now we await the downloads.
                                
                                for (const doc of docs) {
                                    if (doc.mimeType === 'application/vnd.google-apps.folder') {
                                        const children = await listFilesRecursive(doc.id);
                                        results.push(...children);
                                    } else {
                                        const file = await downloadDriveFile(doc.id, doc.name, doc.mimeType);
                                        results.push(file);
                                    }
                                }
                                resolve(results);
                            } else if (data[google.picker.Response.ACTION] === google.picker.Action.CANCEL) {
                                resolve([]);
                            }
                        })
                        .build();
                    picker.setVisible(true);
                };

                // Trigger OAuth flow
                tokenClient.requestAccessToken({prompt: 'consent'});

            } catch (e) {
                console.error("Picker Error", e);
                reject(e);
            }
        });
    });
};