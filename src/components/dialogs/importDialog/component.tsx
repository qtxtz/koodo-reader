import React from "react";
import "./importDialog.css";
import { driveList } from "../../../constants/driveList";
import { backup } from "../../../utils/file/backup";
import { restore } from "../../../utils/file/restore";
import { Trans } from "react-i18next";
import { ImportDialogProps, ImportDialogState } from "./interface";
import packageInfo from "../../../../package.json";
import _ from "underscore";
import toast from "react-hot-toast";
import { isElectron } from "react-device-detect";
import { checkStableUpdate } from "../../../utils/request/common";
import { getCloudConfig } from "../../../utils/file/common";
import SyncService from "../../../utils/storage/syncService";
import {
  getStorageLocation,
  openExternalUrl,
  supportedFormats,
} from "../../../utils/common";
import {
  ConfigService,
  SyncUtil,
} from "../../../assets/lib/kookit-extra-browser.min";
class ImportDialog extends React.Component<
  ImportDialogProps,
  ImportDialogState
> {
  constructor(props: ImportDialogProps) {
    super(props);
    this.state = {
      isBackup: "",
      currentDrive: "",
      currentPath: "",
      currentFileList: [],
      selectedFileList: [],
      isWaitList: false,
    };
  }
  handleClose = () => {
    this.props.handleImportDialog(false);
  };

  showMessage = (message: string) => {
    toast(this.props.t(message));
  };
  handleSelectSource = (event: any) => {
    if (!this.props.dataSourceList.includes(event.target.value)) {
      toast(
        this.props.t(
          "Please add data source in the setting-Sync and backup first"
        )
      );
      return;
    }
    if (
      driveList.find((item) => item.value === event.target.value)?.isPro &&
      !this.props.isAuthed
    ) {
      toast(this.props.t("This feature is not available in the free version"));
      return;
    }
    if (event.target.value === "add") {
      toast(this.props.t("Please add data source in the setting"));
      return;
    }
    this.setState({ currentDrive: event.target.value });
  };
  listFolder = async (drive: string, path: string) => {
    this.setState({ isWaitList: true });
    let fileList = [];
    if (isElectron) {
      const { ipcRenderer } = window.require("electron");
      let tokenConfig = await getCloudConfig(drive);
      fileList = await ipcRenderer.invoke("picker-list", {
        ...tokenConfig,
        baseFolder: "",
        service: drive,
        currentPath: path,
        storagePath: getStorageLocation(),
      });
    } else {
      let pickerUtil = await SyncService.getPickerUtil(drive);
      fileList = await pickerUtil.listFiles(path);
    }
    this.setState({
      currentFileList: fileList,
      isWaitList: false,
    });
  };
  handleClickItem = async (item: string) => {
    if (item.indexOf(".") === -1) {
      this.setState(
        {
          currentPath: this.state.currentPath + "/" + item,
        },
        async () => {
          this.listFolder(this.state.currentDrive, this.state.currentPath);
        }
      );
    } else {
      let sourcePath = this.state.currentPath + "/" + item;
      this.handleImportBook(sourcePath);
    }
  };
  handleImportBook = async (sourcePath: string) => {
    toast.loading(this.props.t("Downloading"), {
      id: "importing",
    });
    let destPath = "temp/" + sourcePath.split("/").pop();
    let file: any = null;
    if (isElectron) {
      const fs = window.require("fs");
      const path = window.require("path");
      const dataPath = getStorageLocation() || "";
      const { ipcRenderer } = window.require("electron");
      let tokenConfig = await getCloudConfig(this.state.currentDrive);
      if (!fs.existsSync(path.join(dataPath, "temp"))) {
        fs.mkdirSync(path.join(dataPath, "temp"), {
          recursive: true,
        });
      }
      await ipcRenderer.invoke("picker-download", {
        ...tokenConfig,
        baseFolder: "",
        sourcePath: sourcePath.substring(1),
        destPath: destPath,
        service: this.state.currentDrive,
        storagePath: dataPath,
      });
      const buffer = fs.readFileSync(path.join(dataPath, destPath));

      let arraybuffer = new Uint8Array(buffer).buffer;
      let blob = new Blob([arraybuffer]);
      let fileName = path.basename(sourcePath);
      file = new File([blob], fileName);
      file.path = sourcePath;
      // Clean up the temp file after import
      fs.unlinkSync(path.join(dataPath, destPath));
    } else {
      let pickerUtil = await SyncService.getPickerUtil(this.state.currentDrive);
      let arraybuffer = await pickerUtil.remote.downloadFile(
        sourcePath.substring(1)
      );
      let blob = new Blob([arraybuffer]);
      let fileName = sourcePath.split("/").pop() || "file";
      file = new File([blob], fileName);
    }
    toast.dismiss("importing");
    await this.props.importBookFunc(file);
  };
  listAllFilesRecursively = async (folderName: string) => {
    toast.loading(this.props.t("Scanning folder"), {
      id: "scanning",
    });

    try {
      const allFiles = await this.getAllFilesInFolder(
        this.state.currentPath + "/" + folderName
      );

      // Filter only files (not folders) and get full paths
      const fileList = allFiles.filter((file) => file.indexOf(".") !== -1);

      if (fileList.length === 0) {
        toast.dismiss("scanning");
        toast(this.props.t("No files found in this folder"));
        return;
      }
      let selectedFileList = fileList.filter((file) =>
        supportedFormats.includes(
          "." + file.split(".").pop()?.toLowerCase() || ""
        )
      );
      toast.dismiss("scanning");
      toast.success(this.props.t("Successfully scanned folder"));
      for (let i = 0; i < selectedFileList.length; i++) {
        let sourcePath = selectedFileList[i];
        await this.handleImportBook(sourcePath);
      }
    } catch (error) {
      toast.dismiss("scanning");
      toast.error(this.props.t("Error scanning folder"));
      console.error("Error scanning folder:", error);
    }
  };

  getAllFilesInFolder = async (folderPath: string): Promise<string[]> => {
    let allFiles: string[] = [];

    try {
      let fileList: string[] = [];

      if (isElectron) {
        const { ipcRenderer } = window.require("electron");
        let tokenConfig = await getCloudConfig(this.state.currentDrive);
        fileList = await ipcRenderer.invoke("picker-list", {
          ...tokenConfig,
          baseFolder: "",
          service: this.state.currentDrive,
          currentPath: folderPath,
          storagePath: getStorageLocation(),
        });
      } else {
        let pickerUtil = await SyncService.getPickerUtil(
          this.state.currentDrive
        );
        fileList = await pickerUtil.listFiles(folderPath);
      }

      for (const item of fileList) {
        const fullPath = folderPath + "/" + item;

        if (item.indexOf(".") === -1) {
          // It's a folder, recursively get files from it
          const subFiles = await this.getAllFilesInFolder(fullPath);
          allFiles = allFiles.concat(subFiles);
        } else {
          // It's a file, add to list
          allFiles.push(fullPath);
        }
      }
    } catch (error) {
      console.error("Error listing files in folder:", error);
    }

    return allFiles;
  };
  render() {
    return (
      <div
        className="backup-page-container"
        style={{ height: "450px", top: "calc(50% - 225px)" }}
      >
        <div className="edit-dialog-title">
          <Trans>From cloud storage</Trans>
        </div>
        <div className="import-dialog-option">
          {this.state.currentDrive === "" && (
            <>
              {driveList
                .filter((item) => {
                  if (ConfigService.getItem("serverRegion") === "china") {
                    return item.isCNAvailable;
                  }
                  return true;
                })
                .filter(
                  (item) =>
                    !item.scoped &&
                    item.support.includes(isElectron ? "desktop" : "browser")
                )
                .map((item) => (
                  <div
                    key={item.value}
                    className={`cloud-drive-item `}
                    onClick={() => {
                      if (!this.props.isAuthed) {
                        toast(
                          this.props.t(
                            "This feature is not available in the free version"
                          )
                        );
                        return;
                      }
                      if (!this.props.dataSourceList.includes(item.value)) {
                        this.props.handleSetting(true);
                        this.props.handleSettingMode("sync");
                        this.props.handleSettingDrive(item.value);
                        let settingDrive = item.value;
                        if (
                          settingDrive === "dropbox" ||
                          settingDrive === "google" ||
                          settingDrive === "boxnet" ||
                          settingDrive === "pcloud" ||
                          settingDrive === "adrive" ||
                          settingDrive === "microsoft_exp" ||
                          settingDrive === "google_exp" ||
                          settingDrive === "microsoft"
                        ) {
                          openExternalUrl(
                            new SyncUtil(settingDrive, {}).getAuthUrl()
                          );
                        }
                        return;
                      }
                      this.setState({
                        currentDrive: item.value,
                        currentPath: "",
                      });
                      this.listFolder(item.value, "");
                    }}
                  >
                    <span className="cloud-drive-label">
                      {this.props.t(item.label)}
                    </span>
                    <span className="icon-dropdown import-dialog-more-file"></span>
                  </div>
                ))}
            </>
          )}
          {this.state.currentDrive !== "" &&
            this.state.currentFileList.length > 0 &&
            this.state.currentFileList.map((item, index) => (
              <div key={index} className={`cloud-drive-item `}>
                <span
                  className="cloud-drive-label"
                  onClick={async () => {
                    this.handleClickItem(item);
                  }}
                >
                  {item}
                </span>
                {item.indexOf(".") === -1 && (
                  <span
                    className="import-dialog-folder-button"
                    onClick={() => {
                      //list all files in the folder and its subfolder
                      this.listAllFilesRecursively(item);
                    }}
                  >
                    <span
                      data-tooltip-id="my-tooltip"
                      data-tooltip-content={this.props.t("Import folder")}
                    >
                      <span className="icon-import import-dialog-folder-icon"></span>
                    </span>
                  </span>
                )}
                {item.indexOf(".") === -1 ? (
                  <span
                    className="icon-dropdown import-dialog-more-file"
                    onClick={async () => {
                      this.handleClickItem(item);
                    }}
                  ></span>
                ) : this.state.selectedFileList.includes(
                    this.state.currentPath + "/" + item
                  ) ? (
                  <span
                    className="icon-check import-dialog-check-file"
                    style={{ fontWeight: "bold" }}
                    onClick={() => {
                      this.setState({
                        selectedFileList: this.state.selectedFileList.filter(
                          (file) => file !== this.state.currentPath + "/" + item
                        ),
                      });
                    }}
                  ></span>
                ) : (
                  <span
                    className="icon-add import-dialog-more-file"
                    onClick={() => {
                      this.setState({
                        selectedFileList: [
                          ...this.state.selectedFileList,
                          this.state.currentPath + "/" + item,
                        ],
                      });
                    }}
                  ></span>
                )}
              </div>
            ))}
          {this.state.currentDrive !== "" &&
            this.state.currentFileList.length === 0 &&
            this.state.isWaitList && (
              <div className="loading-animation" style={{ height: "100%" }}>
                <div className="loader"></div>
              </div>
            )}
          {this.state.currentDrive !== "" &&
            this.state.currentFileList.length === 0 &&
            !this.state.isWaitList && (
              <div className="loading-animation" style={{ height: "100%" }}>
                {this.props.t("Empty")}
              </div>
            )}
        </div>
        <div
          className="import-dialog-back-button"
          style={{ left: "20px", color: "rgb(231, 69, 69)" }}
          onClick={async () => {
            if (this.state.selectedFileList.length === 0) {
              toast.error(this.props.t("No file selected"));
              return;
            }
            for (let i = 0; i < this.state.selectedFileList.length; i++) {
              let sourcePath = this.state.selectedFileList[i];
              await this.handleImportBook(sourcePath);
            }
            this.setState({
              selectedFileList: [],
            });
          }}
        >
          {this.props.t("Import") +
            " (" +
            this.state.selectedFileList.length +
            ")"}
        </div>
        <div
          className="import-dialog-back-button"
          onClick={async () => {
            if (this.state.currentPath === "") {
              this.setState({ currentDrive: "", currentFileList: [] });
              return;
            }
            let parentPath = this.state.currentPath
              .split("/")
              .slice(0, -1)
              .join("/");
            this.setState({ currentPath: parentPath });
            this.listFolder(this.state.currentDrive, parentPath);
          }}
        >
          {this.props.t("Back to parent")}
        </div>

        <div
          className="backup-page-close-icon"
          onClick={() => {
            this.handleClose();
          }}
        >
          <span className="icon-close backup-close-icon"></span>
        </div>
      </div>
    );
  }
}

export default ImportDialog;
