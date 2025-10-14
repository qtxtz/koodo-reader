import React from "react";
import "./settingPanel.css";
import ThemeList from "../../../components/readerSettings/themeList";
import SliderList from "../../../components/readerSettings/sliderList";
import DropdownList from "../../../components/readerSettings/dropdownList";
import ModeControl from "../../../components/readerSettings/modeControl";
import SettingSwitch from "../../../components/readerSettings/settingSwitch";
import { SettingPanelProps, SettingPanelState } from "./interface";
import { Trans } from "react-i18next";
import { ConfigService } from "../../../assets/lib/kookit-extra-browser.min";
import BookUtil from "../../../utils/file/bookUtil";
import { sliderConfigs } from "../../../constants/dropdownList";

class SettingPanel extends React.Component<
  SettingPanelProps,
  SettingPanelState
> {
  constructor(props: SettingPanelProps) {
    super(props);
    this.state = {
      isSettingLocked:
        ConfigService.getReaderConfig("isSettingLocked") === "yes"
          ? true
          : false,
    };
  }

  handleLock = () => {
    this.props.handleSettingLock(!this.props.isSettingLocked);
    ConfigService.setReaderConfig(
      "isSettingLocked",
      !this.props.isSettingLocked ? "yes" : "no"
    );
    this.props.renderBookFunc();
  };

  render() {
    return (
      <div
        className="setting-panel-parent"
        style={{
          backgroundColor: this.props.isSettingLocked
            ? this.props.backgroundColor
            : "",
          color: this.props.isSettingLocked
            ? ConfigService.getReaderConfig("textColor")
            : "",
        }}
      >
        <span
          className={
            this.props.isSettingLocked
              ? "icon-lock lock-icon"
              : "icon-unlock lock-icon"
          }
          onClick={() => {
            this.handleLock();
          }}
        ></span>

        <div className="setting-panel-title">
          <Trans>Reading option</Trans>
        </div>
        <div className="setting-panel">
          <ModeControl />
          <ThemeList />
          {sliderConfigs
            .filter((item) => {
              if (
                this.props.currentBook.format === "PDF" &&
                ConfigService.getReaderConfig("isConvertPDF") !== "yes"
              ) {
                return item.isPDF;
              }
              return true;
            })
            .map((item) => (
              <SliderList {...{ item }} />
            ))}
          <DropdownList />
          <SettingSwitch />
        </div>
      </div>
    );
  }
}

export default SettingPanel;
