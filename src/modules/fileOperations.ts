import Addon from "../addon";
import { getString } from "../utils/locale";

declare const addon: Addon;
declare const ztoolkit: any;

// Add declarations for Firefox/Zotero APIs
declare namespace Components {
  const classes: any;
  const interfaces: any;
}

/**
 * Class for handling Tex source file operations
 */
export class TexFileOperations {
  // Use OS module from ChromeUtils
  private static OS = ChromeUtils.importESModule("chrome://zotero/content/osfile.mjs").OS;

  /**
   * Process a Zotero attachment that is a Tex_Source.zip file
   * @param attachment The Zotero attachment item
   * @returns True if processing was successful, false otherwise
   */
  public static async processTexZip(attachment: Zotero.Item): Promise<boolean> {
    try {
      // Get the file path and check if it exists
      const zipFilePath = attachment.getFilePath();
      if (!zipFilePath) {
        ztoolkit.log("ERROR: File path is undefined");
        return false;
      }

      // Check if the file has the correct extension
      if (!zipFilePath.toLowerCase().endsWith(".zip")) {
        ztoolkit.log("ERROR: File is not a zip file");
        return false;
      }

      // Create a temporary directory for extraction
      const tempDir = Zotero.getTempDirectory();
      const extractDirName = Zotero.Utilities.randomString() + "-" + attachment.key;
      const extractDir = Zotero.File.pathToFile(tempDir.path);
      extractDir.append(extractDirName);
      
      if (!extractDir.exists()) {
        // Cast to any to avoid TypeScript errors with Firefox/Zotero APIs
        extractDir.create((Components.interfaces as any).nsIFile.DIRECTORY_TYPE, 0o755 as number);
      }

      // Use Zotero utilities to extract the zip file
      ztoolkit.log("INFO: Extracting ZIP file");
      try {
        // Cast to any to avoid TypeScript errors with Firefox/Zotero APIs
        const zipReader = (Components.classes as any)["@mozilla.org/libjar/zip-reader;1"]
          .createInstance((Components.interfaces as any).nsIZipReader);
        zipReader.open(Zotero.File.pathToFile(zipFilePath));
        
        const entries = zipReader.findEntries(null);
        while (entries.hasMore()) {
          const entryName = entries.getNext();
          
          // Skip directories for now
          if (entryName.endsWith("/")) {
            continue;
          }
          
          // Create directory structure if needed
          let targetFile = extractDir.clone();
          const parts = entryName.split("/");
          
          // Create the subdirectories if needed
          for (let i = 0; i < parts.length - 1; i++) {
            targetFile.append(parts[i]);
            if (!targetFile.exists()) {
              // Cast to any to avoid TypeScript errors with Firefox/Zotero APIs
              targetFile.create((Components.interfaces as any).nsIFile.DIRECTORY_TYPE, 0o755 as number);
            }
          }
          
          // Extract the file
          targetFile.append(parts[parts.length - 1]);
          zipReader.extract(entryName, targetFile);
        }
        
        zipReader.close();
        ztoolkit.log("INFO: ZIP file extracted successfully");
      } catch (e) {
        ztoolkit.log("ERROR: Failed to extract ZIP file: " + e);
        return false;
      }
      
      // Find all .tex files
      ztoolkit.log("INFO: Scanning for .tex files");
      const texFiles: any[] = [];
      
      // Function to scan a directory for .tex files
      const scanDirForTexFiles = (dir: any): void => {
        const entries = dir.directoryEntries;
        while (entries.hasMoreElements()) {
          const entry = entries.getNext().QueryInterface((Components.interfaces as any).nsIFile);
          
          if (entry.isDirectory()) {
            scanDirForTexFiles(entry);
          } else if (entry.leafName.toLowerCase().endsWith(".tex")) {
            texFiles.push(entry);
          }
        }
      };
      
      // Start the scan
      scanDirForTexFiles(extractDir);
      
      if (texFiles.length === 0) {
        ztoolkit.log("ERROR: No .tex files found in the archive");
        return false;
      }
      
      // Sort tex files alphabetically by name
      texFiles.sort((a, b) => a.leafName.localeCompare(b.leafName));
      
      ztoolkit.log(`INFO: Found ${texFiles.length} .tex files`);
      
      // Check if files are already in the standardized format
      const hasMainEnTex = texFiles.some(file => file.leafName === "Main_En.tex");
      const hasStandardizedSMFiles = texFiles.some(file => /^SM\d+_En\.tex$/.test(file.leafName));
      
      // If the files are already processed (Main_En.tex exists), return success
      if (hasMainEnTex && hasStandardizedSMFiles) {
        ztoolkit.log("INFO: Files already in standardized format, no renaming needed");
        // Still repackage the files to ensure consistency
        // Proceed with ZIP operations but skip renaming
      } else if (hasMainEnTex || hasStandardizedSMFiles) {
        // Only some files are in standardized format - this is an inconsistent state
        ztoolkit.log("WARNING: Some files are in standardized format, but not all. Proceeding with full standardization.");
      }
      
      // Only rename files if they're not already in the standardized format
      if (!hasMainEnTex) {
        // Rename the main .tex file
        const mainTexFile = texFiles[0];
        const mainTexDir = mainTexFile.parent;
        const newMainFileName = "Main_En.tex";
        
        ztoolkit.log(`INFO: Renaming main file: ${mainTexFile.leafName} -> ${newMainFileName}`);
        
        // Copy the main file with the new name
        const newMainFile = mainTexDir.clone();
        newMainFile.append(newMainFileName);
        if (newMainFile.exists()) {
          newMainFile.remove(false);
        }
        mainTexFile.copyTo(mainTexDir, newMainFileName);
        
        // Remove the original file
        mainTexFile.remove(false);
        
        // Rename other .tex files
        for (let i = 1; i < texFiles.length; i++) {
          const texFile = texFiles[i];
          const texDir = texFile.parent;
          const newFileName = `SM${i}_En.tex`;
          
          // Skip if file is already named correctly
          if (texFile.leafName === newFileName) {
            continue;
          }
          
          ztoolkit.log(`INFO: Renaming supplementary file: ${texFile.leafName} -> ${newFileName}`);
          
          // Copy the file with the new name
          const newFile = texDir.clone();
          newFile.append(newFileName);
          if (newFile.exists()) {
            newFile.remove(false);
          }
          texFile.copyTo(texDir, newFileName);
          
          // Remove the original file
          texFile.remove(false);
        }
      } else {
        ztoolkit.log("INFO: Skipping renaming as files are already in standardized format");
      }
      
      // Create a new zip file
      ztoolkit.log("INFO: Creating new ZIP file");
      
      // Create a temporary file for the new zip
      const tempZipFile = Zotero.getTempDirectory();
      tempZipFile.append(Zotero.Utilities.randomString() + ".zip");
      if (tempZipFile.exists()) {
        tempZipFile.remove(false);
      }
      
      // Create a zip writer
      // Cast to any to avoid TypeScript errors with Firefox/Zotero APIs
      const zipWriter = (Components.classes as any)["@mozilla.org/zipwriter;1"]
        .createInstance((Components.interfaces as any).nsIZipWriter);
      zipWriter.open(tempZipFile, 0x04 | 0x08); // PR_RDWR | PR_CREATE_FILE
      
      // Add files to the zip recursively
      const addDirToZip = (dir: any, zipPath: string): void => {
        const entries = dir.directoryEntries;
        while (entries.hasMoreElements()) {
          const entry = entries.getNext().QueryInterface((Components.interfaces as any).nsIFile);
          const entryZipPath = zipPath ? zipPath + "/" + entry.leafName : entry.leafName;
          
          if (entry.isDirectory()) {
            // Recursively add subdirectories
            addDirToZip(entry, entryZipPath);
          } else {
            // Add file to zip
            zipWriter.addEntryFile(
              entryZipPath,
              (Components.interfaces as any).nsIZipWriter.COMPRESSION_DEFAULT,
              entry,
              false
            );
          }
        }
      };
      
      // Start adding files
      addDirToZip(extractDir, "");
      
      // Close the zip file
      zipWriter.close();
      
      // Replace the original attachment file
      ztoolkit.log("INFO: Replacing the original ZIP file");
      const originalZipFile = Zotero.File.pathToFile(zipFilePath);
      
      // Create a backup of the original file
      const backupFile = originalZipFile.parent.clone();
      backupFile.append(originalZipFile.leafName + ".bak");
      if (backupFile.exists()) {
        backupFile.remove(false);
      }
      originalZipFile.copyTo(originalZipFile.parent, originalZipFile.leafName + ".bak");
      
      // Replace the original file with the new one
      tempZipFile.copyTo(originalZipFile.parent, originalZipFile.leafName);
      
      // Add the "renamed" tag to the attachment
      ztoolkit.log("INFO: Adding 'renamed' tag");
      try {
        const tag = "renamed";
        attachment.addTag(tag);
        await attachment.saveTx();
      } catch (error) {
        ztoolkit.log("ERROR: Failed to add tag: " + error);
      }
      
      // Clean up temporary files
      try {
        // Remove the extracted directory
        extractDir.remove(true);
        
        // Remove the temporary zip file
        tempZipFile.remove(false);
      } catch (e) {
        ztoolkit.log("WARNING: Failed to clean up temporary files: " + e);
      }
      
      ztoolkit.log("INFO: File processing completed successfully");
      return true;
    } catch (error) {
      ztoolkit.log("ERROR: Processing Tex zip file: " + error);
      return false;
    }
  }

  /**
   * Find the first Tex_Source.zip attachment in a parent item
   * @param parentItem The parent Zotero item
   * @returns The first Tex_Source.zip attachment or null if none found
   */
  public static async findTexSourceAttachment(parentItem: Zotero.Item): Promise<Zotero.Item | null> {
    // Skip if item is already an attachment
    if (parentItem.isAttachment()) {
      return null;
    }

    // Get all attachments of the parent item
    const attachmentIDs = parentItem.getAttachments();
    if (!attachmentIDs || attachmentIDs.length === 0) {
      return null;
    }

    // Find the first Tex_Source.zip attachment
    for (const attachmentID of attachmentIDs) {
      const attachment = await Zotero.Items.getAsync(attachmentID);
      if (attachment.isAttachment() && 
          attachment.attachmentContentType === "application/zip") {
        const fileName = attachment.getField("title") as string;
        if (fileName.includes("Tex_Source.zip")) {
          return attachment;
        }
      }
    }

    return null;
  }
}

export class FileOperationsFactory {
  /**
   * Register a right-click menu item for processing Tex_Source.zip files
   */
  static registerTexZipProcessor() {
    // Add menu item to the item context menu with conditional display
    ztoolkit.Menu.register("item", {
      tag: "menuitem",
      id: "zotero-item-menu-tex-operations-zip-regularize",
      label: getString("menuitem-zip-regularize"),
      // Only show menu for Tex_Source.zip files or parent items that might have Tex_Source.zip attachments
      getVisibility: (elem: any, ev: Event) => {
        const items = Zotero.getActiveZoteroPane().getSelectedItems();
        if (!items || items.length === 0) {
          return false;
        }
        
        // For direct attachments - only show for ZIP files with "Tex_Source.zip" in the name
        if (items.length === 1 && items[0].isAttachment()) {
          if (items[0].attachmentContentType === "application/zip") {
            const fileName = items[0].getField("title") as string;
            if (fileName.includes("Tex_Source.zip")) {
              return true;
            }
          }
          // Hide for any other attachment type
          return false;
        }
        
        // For parent items - only show if they have Tex_Source.zip attachments
        for (const item of items) {
          if (!item.isAttachment() && !item.isNote()) {
            const attachmentIDs = item.getAttachments();
            if (!attachmentIDs || attachmentIDs.length === 0) {
              continue;
            }
            
            // Check if any attachment is a Tex_Source.zip file
            for (const attachmentID of attachmentIDs) {
              const attachment = Zotero.Items.get(attachmentID);
              if (attachment.isAttachment() && 
                  attachment.attachmentContentType === "application/zip") {
                const fileName = attachment.getField("title") as string;
                if (fileName.includes("Tex_Source.zip")) {
                  return true;
                }
              }
            }
          }
        }
        
        return false;
      },
      commandListener: (event: Event) => {
        const items = Zotero.getActiveZoteroPane().getSelectedItems();
        if (!items || items.length === 0) {
          return;
        }
        
        // Collect items to process - either direct attachments or parent items with attachments
        const processQueue: {item: Zotero.Item, isParent: boolean}[] = [];
        
        for (const item of items) {
          if (item.isAttachment() && item.attachmentContentType === "application/zip") {
            const fileName = item.getField("title") as string;
            if (fileName.includes("Tex_Source.zip")) {
              processQueue.push({item, isParent: false});
            }
          } else if (!item.isAttachment()) {
            // For parent items, we'll find and process their Tex_Source.zip attachments
            processQueue.push({item, isParent: true});
          }
        }
        
        if (processQueue.length === 0) {
          return;
        }
        
        // Show progress window
        const progressWindow = new ztoolkit.ProgressWindow(addon.data.config.addonName)
          .createLine({
            text: getString("zip-regularize-progress"),
            type: "default",
            progress: 0
          })
          .show();
        
        // Process items in batches if there are more than 10
        const batchSize = 10;
        const processInBatches = async () => {
          let totalProcessed = 0;
          let successCount = 0;
          let failCount = 0;
          
          // Process in batches of batchSize
          for (let i = 0; i < processQueue.length; i += batchSize) {
            const batch = processQueue.slice(i, i + batchSize);
            const batchPromises = batch.map(async ({item, isParent}) => {
              try {
                let attachmentToProcess = item;
                
                // For parent items, find the first Tex_Source.zip attachment
                if (isParent) {
                  const texAttachment = await TexFileOperations.findTexSourceAttachment(item);
                  // No Tex_Source.zip attachment found for this parent item
                  if (!texAttachment) {
                    failCount++;
                    return false;
                  }
                  attachmentToProcess = texAttachment;
                }
                
                // Process the attachment
                const success = await TexFileOperations.processTexZip(attachmentToProcess);
                if (success) {
                  successCount++;
                } else {
                  failCount++;
                }
                
                return success;
              } catch (error) {
                ztoolkit.log("ERROR: Processing item: " + error);
                failCount++;
                return false;
              }
            });
            
            // Wait for all items in the batch to be processed
            await Promise.all(batchPromises);
            
            // Update progress
            totalProcessed += batch.length;
            const progressPercent = Math.round((totalProcessed / processQueue.length) * 100);
            
            progressWindow.changeLine({
              text: `Processing: ${totalProcessed}/${processQueue.length} items`,
              progress: progressPercent
            });
          }
          
          // Final status update
          if (successCount > 0 && failCount === 0) {
            progressWindow.changeLine({
              text: `Successfully processed ${successCount} item${successCount > 1 ? 's' : ''}`,
              type: "success",
              progress: 100
            });
          } else if (successCount > 0 && failCount > 0) {
            progressWindow.changeLine({
              text: `Processed ${successCount} item${successCount > 1 ? 's' : ''}, ${failCount} failed`,
              type: "warning",
              progress: 100
            });
          } else {
            progressWindow.changeLine({
              text: `Processing failed for all items`,
              type: "error",
              progress: 100
            });
          }
          
          progressWindow.startCloseTimer(3000);
        };
        
        // Start processing
        processInBatches();
      },
      icon: `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`,
    });
  }
} 