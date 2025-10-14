import React from "react";
import { ViewerProps, ViewerState } from "./interface";
import { withRouter } from "react-router-dom";
import BookUtil from "../../utils/file/bookUtil";
import PopupMenu from "../../components/popups/popupMenu";
import Background from "../../components/background";
import toast from "react-hot-toast";
import StyleUtil from "../../utils/reader/styleUtil";
import "./index.css";
import { HtmlMouseEvent } from "../../utils/reader/mouseEvent";
import ImageViewer from "../../components/imageViewer";
import { getIframeDoc } from "../../utils/reader/docUtil";
import PopupBox from "../../components/popups/popupBox";
import Note from "../../models/Note";
import PageWidget from "../pageWidget";
import {
  getPageWidth,
  getPdfPassword,
  scrollContents,
  showDownloadProgress,
} from "../../utils/common";
import _ from "underscore";
import {
  BookHelper,
  ConfigService,
} from "../../assets/lib/kookit-extra-browser.min";
import * as Kookit from "../../assets/lib/kookit.min";
import PopupRefer from "../../components/popups/popupRefer";
import { ocrLangList } from "../../constants/dropdownList";
declare var window: any;
let lock = false; //prevent from clicking too fasts

class Viewer extends React.Component<ViewerProps, ViewerState> {
  lock: boolean;
  constructor(props: ViewerProps) {
    super(props);
    this.state = {
      cfiRange: null,
      contents: null,
      rect: null,
      key: "",
      isFirst: true,
      chapterTitle:
        ConfigService.getObjectConfig(
          this.props.currentBook.key,
          "recordLocation",
          {}
        ).chapterTitle || "",
      isDisablePopup: ConfigService.getReaderConfig("isDisablePopup") === "yes",
      isTouch: ConfigService.getReaderConfig("isTouch") === "yes",
      chapterDocIndex: parseInt(
        ConfigService.getObjectConfig(
          this.props.currentBook.key,
          "recordLocation",
          {}
        ).chapterDocIndex || 0
      ),
      pageOffset: "",
      pageWidth: "",
      chapter: "",
      rendition: null,
    };
    this.lock = false;
  }
  UNSAFE_componentWillMount() {
    this.props.handleFetchBookmarks();
    this.props.handleFetchNotes();
    this.props.handleFetchBooks();
    this.props.handleFetchPlugins();
    this.props.handleFetchAuthed();
  }
  componentDidMount() {
    this.handleRenderBook();
    //make sure page width is always 12 times, section = Math.floor(element.clientWidth / 12), or text will be blocked
    this.setState(
      getPageWidth(
        this.props.readerMode,
        this.props.scale,
        parseInt(this.props.margin),
        this.props.isNavLocked,
        this.props.isSettingLocked
      )
    );
    this.props.handleRenderBookFunc(this.handleRenderBook);

    window.addEventListener("resize", () => {
      BookUtil.reloadBooks();
    });
  }
  async UNSAFE_componentWillReceiveProps(nextProps: ViewerProps) {
    if (
      nextProps.margin !== this.props.margin ||
      nextProps.scale !== this.props.scale ||
      nextProps.readerMode !== this.props.readerMode ||
      nextProps.isNavLocked !== this.props.isNavLocked ||
      nextProps.isSettingLocked !== this.props.isSettingLocked
    ) {
      this.setState(
        getPageWidth(
          nextProps.readerMode,
          nextProps.scale,
          parseInt(nextProps.margin),
          nextProps.isNavLocked,
          nextProps.isSettingLocked
        )
      );
    }
  }
  handleHighlight = async (rendition: any) => {
    let highlighters: any = this.props.notes;
    if (!highlighters) return;
    let highlightersByChapter = highlighters.filter((item: Note) => {
      if (item.bookKey !== this.props.currentBook.key) {
        return false;
      }

      let cfi = JSON.parse(item.cfi);
      if (cfi.cfi) {
        // epub from 1.5.2 or older
        return (
          item.chapter ===
          rendition.getChapterDoc()[this.state.chapterDocIndex].label
        );
      } else if (cfi.fingerprint) {
        // pdf from 1.7.4 or older
        return cfi.page - 1 === this.state.chapterDocIndex;
      } else {
        return item.chapterIndex === this.state.chapterDocIndex;
      }
    });
    if (this.props.currentBook.format === "PDF") {
      highlightersByChapter = highlightersByChapter.map((item: Note) => {
        let cfi = JSON.parse(item.cfi);
        if (cfi.fingerprint) {
          item.chapterIndex = cfi.page - 1;
          cfi.chapterDocIndex = cfi.page - 1 + "";
          cfi.chapterHref = "title" + (cfi.page - 1);
          item.cfi = JSON.stringify(cfi);
        }

        return item;
      });
    }
    await this.props.htmlBook.rendition.renderHighlighters(
      highlightersByChapter,
      this.handleNoteClick
    );
    if (
      this.props.currentBook.format === "PDF" &&
      (this.props.readerMode === "double" ||
        this.props.readerMode === "scroll") &&
      ConfigService.getReaderConfig("isConvertPDF") !== "yes"
    ) {
      let highlightersByChapter = highlighters.filter((item: Note) => {
        if (item.bookKey !== this.props.currentBook.key) {
          return false;
        }
        let cfi = JSON.parse(item.cfi);
        if (cfi.fingerprint) {
          // pdf from 1.7.4 or older
          return cfi.page === this.state.chapterDocIndex;
        } else {
          return item.chapterIndex === this.state.chapterDocIndex + 1;
        }
      });
      if (this.props.currentBook.format === "PDF") {
        highlightersByChapter = highlightersByChapter.map((item: Note) => {
          let cfi = JSON.parse(item.cfi);
          if (cfi.fingerprint) {
            item.chapterIndex = cfi.page - 1;
            cfi.chapterDocIndex = cfi.page - 1 + "";
            cfi.chapterHref = "title" + (cfi.page - 1);
            item.cfi = JSON.stringify(cfi);
          }

          return item;
        });
      }
      await this.props.htmlBook.rendition.renderHighlighters(
        highlightersByChapter,
        this.handleNoteClick
      );
    }
  };
  handleNoteClick = (event: Event) => {
    this.props.handleNoteKey((event.target as any).dataset.key);
    this.props.handleMenuMode("note");
    this.props.handleOpenMenu(true);
  };
  handleRenderBook = async () => {
    if (lock) return;
    let { key, path, format, name } = this.props.currentBook;
    this.props.handleHtmlBook(null);
    if (this.state.rendition) {
      this.state.rendition.removeContent();
    }
    let isCacheExsit = await BookUtil.isBookExist("cache-" + key, "zip", path);
    BookUtil.fetchBook(
      isCacheExsit ? "cache-" + key : key,
      isCacheExsit ? "zip" : format.toLowerCase(),
      true,
      path
    ).then(async (result: any) => {
      if (!result) {
        if (this.props.defaultSyncOption) {
          let timer = showDownloadProgress(
            this.props.defaultSyncOption,
            "cloud",
            this.props.currentBook.size
          );
          let result = await BookUtil.downloadBook(key, format.toLowerCase());
          clearInterval(timer);
          toast.dismiss("offline-book");
          if (result) {
            toast.success(this.props.t("Download successful"));
          } else {
            result = await BookUtil.downloadCacheBook(key);
            if (result) {
              toast.success(this.props.t("Download successful"));
            } else {
              toast.error(this.props.t("Download failed"));
              return;
            }
          }
        } else {
          toast.error(this.props.t("Book not exists"));
          return;
        }
      }

      let rendition = BookHelper.getRendition(
        result,
        {
          format: isCacheExsit ? "CACHE" : format,
          readerMode: this.props.readerMode,
          charset: this.props.currentBook.charset,
          animation:
            ConfigService.getReaderConfig("isSliding") === "yes"
              ? "sliding"
              : "",
          convertChinese: ConfigService.getReaderConfig("convertChinese"),
          parserRegex: "",
          isDarkMode:
            ConfigService.getReaderConfig("backgroundColor") ===
            "rgba(44,47,49,1)"
              ? "yes"
              : "no",
          backgroundColor: ConfigService.getReaderConfig("backgroundColor"),
          isMobile: "no",
          isIndent: ConfigService.getReaderConfig("isIndent"),
          isStartFromEven: ConfigService.getReaderConfig("isStartFromEven"),
          password: getPdfPassword(this.props.currentBook),
          scale: parseFloat(this.props.scale),
          isConvertPDF: ConfigService.getReaderConfig("isConvertPDF"),
          ocrLang: ConfigService.getReaderConfig("ocrLang")
            ? ConfigService.getReaderConfig("ocrLang")
            : ocrLangList.find(
                (item) => item.lang === ConfigService.getReaderConfig("lang")
              )?.value || "chi_sim",
          ocrEngine: ConfigService.getReaderConfig("ocrEngine") || "tesseract",
          serverRegion: ConfigService.getItem("serverRegion") || "global",
          paraSpacingValue:
            ConfigService.getReaderConfig("paraSpacingValue") || "1.5",
          titleSizeValue:
            ConfigService.getReaderConfig("titleSizeValue") || "1.2",
          isScannedPDF:
            this.props.currentBook.description.indexOf("scanned PDF") > -1
              ? "yes"
              : "no",
        },
        Kookit
      );
      if (this.props.currentBook.format === "TXT") {
        let bookLocation = ConfigService.getObjectConfig(
          this.props.currentBook.key,
          "recordLocation",
          {}
        );
        await rendition.renderTo(
          document.getElementById("page-area"),
          bookLocation
        );
      } else {
        await rendition.renderTo(document.getElementById("page-area"));
      }

      await this.handleRest(rendition);
      this.props.handleReadingState(true);

      ConfigService.setListConfig(this.props.currentBook.key, "recentBooks");
      document.title = name + " - Koodo Reader";
    });
  };

  handleRest = async (rendition: any) => {
    HtmlMouseEvent(
      rendition,
      this.props.currentBook.key,
      this.props.readerMode,
      this.props.currentBook.format
    );
    let chapters = rendition.getChapter();
    let chapterDocs = rendition.getChapterDoc();
    let flattenChapters = rendition.flatChapter(chapters);
    this.props.handleHtmlBook({
      key: this.props.currentBook.key,
      chapters,
      flattenChapters,
      rendition: rendition,
    });
    this.setState({ rendition });

    StyleUtil.addDefaultCss();
    rendition.tranformText();
    // rendition.setStyle(StyleUtil.getCustomCss());
    let bookLocation: {
      text: string;
      count: string;
      chapterTitle: string;
      chapterDocIndex: string;
      chapterHref: string;
      percentage: string;
      cfi: string;
      page: string;
    } = ConfigService.getObjectConfig(
      this.props.currentBook.key,
      "recordLocation",
      {}
    );
    if (chapterDocs.length > 0) {
      await rendition.goToPosition(
        JSON.stringify({
          text: bookLocation.text || "",
          chapterTitle: bookLocation.chapterTitle || "",
          page: bookLocation.page || "",
          chapterDocIndex: bookLocation.chapterDocIndex || 0,
          chapterHref: bookLocation.chapterHref || "",
          count: bookLocation.hasOwnProperty("cfi")
            ? "ignore"
            : bookLocation.count || 0,
          percentage: bookLocation.percentage,
          cfi: bookLocation.cfi,
          isFirst: true,
        })
      );
    }
    if (
      this.props.currentBook.format === "TXT" &&
      rendition.format !== "CACHE"
    ) {
      setTimeout(async () => {
        await rendition.refreshContent();
        let chapters = rendition.getChapter();
        let flattenChapters = rendition.flatChapter(chapters);
        this.props.handleHtmlBook({
          key: this.props.currentBook.key,
          chapters,
          flattenChapters,
          rendition: rendition,
        });
      }, 1000);
    }

    rendition.on("rendered", async () => {
      this.handleLocation();
      let bookLocation: {
        text: string;
        count: string;
        chapterTitle: string;
        chapterDocIndex: string;
        chapterHref: string;
      } = ConfigService.getObjectConfig(
        this.props.currentBook.key,
        "recordLocation",
        {}
      );

      let chapter =
        bookLocation.chapterTitle ||
        (this.props.htmlBook && this.props.htmlBook.flattenChapters[0]
          ? this.props.htmlBook.flattenChapters[0].label
          : "Unknown chapter");
      let chapterDocIndex = 0;
      if (bookLocation.chapterDocIndex) {
        chapterDocIndex = parseInt(bookLocation.chapterDocIndex);
      } else {
        chapterDocIndex =
          bookLocation.chapterTitle && this.props.htmlBook
            ? _.findLastIndex(
                this.props.htmlBook.flattenChapters.map((item) => {
                  item.label = item.label.trim();
                  return item;
                }),
                {
                  label: bookLocation.chapterTitle.trim(),
                }
              )
            : 0;
      }
      this.props.handleCurrentChapter(chapter);
      this.props.handleCurrentChapterIndex(chapterDocIndex);

      this.setState({
        chapter,
        chapterDocIndex,
      });

      scrollContents(chapter, bookLocation.chapterHref);
      StyleUtil.addDefaultCss();
      rendition.tranformText();
      this.handleBindGesture();
      await this.handleHighlight(rendition);
      lock = true;
      setTimeout(function () {
        lock = false;
      }, 1000);
      return false;
    });
  };

  handleLocation = () => {
    if (!this.props.htmlBook) {
      return;
    }
    let position = this.props.htmlBook.rendition.getPosition();
    ConfigService.setObjectConfig(
      this.props.currentBook.key,
      position,
      "recordLocation"
    );
  };
  handleBindGesture = () => {
    let docs = getIframeDoc(this.props.currentBook.format);
    for (let i = 0; i < docs.length; i++) {
      let doc = docs[i];
      if (!doc) continue;
      doc.addEventListener("click", () => {
        this.props.handleLeaveReader("left");
        this.props.handleLeaveReader("right");
        this.props.handleLeaveReader("top");
        this.props.handleLeaveReader("bottom");
      });
      doc.addEventListener("mouseup", (event) => {
        if (
          this.props.currentBook.format === "PDF" &&
          ConfigService.getReaderConfig("isConvertPDF") !== "yes"
        ) {
          let ownerDoc = (event.target as HTMLElement).ownerDocument;
          let targetIframe = ownerDoc?.defaultView?.frameElement;
          let id = targetIframe?.getAttribute("id") || "";
          let chapterDocIndex = id ? parseInt(id.split("-").reverse()[0]) : 0;
          this.setState({ chapterDocIndex });
        }

        if (this.state.isDisablePopup) {
          if (doc!.getSelection()!.toString().trim().length === 0) {
            let rect = doc!
              .getSelection()!
              .getRangeAt(0)
              .getBoundingClientRect();
            this.setState({ rect });
          }
        }
        if (this.state.isDisablePopup) return;
        let selection = doc!.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        var rect = selection.getRangeAt(0).getBoundingClientRect();
        this.setState({ rect });
      });
      doc.addEventListener("contextmenu", (event) => {
        if (
          this.props.currentBook.format === "PDF" &&
          ConfigService.getReaderConfig("isConvertPDF") !== "yes"
        ) {
          let ownerDoc = (event.target as HTMLElement).ownerDocument;
          let targetIframe = ownerDoc?.defaultView?.frameElement;
          let id = targetIframe?.getAttribute("id") || "";
          let chapterDocIndex = id ? parseInt(id.split("-").reverse()[0]) : 0;
          this.setState({ chapterDocIndex });
        }
        if (document.location.href.indexOf("localhost") === -1) {
          event.preventDefault();
        }

        if (!this.state.isDisablePopup && !this.state.isTouch) return;

        if (
          !doc!.getSelection() ||
          doc!.getSelection()!.toString().trim().length === 0
        ) {
          return;
        }
        let selection = doc!.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        var rect = selection.getRangeAt(0).getBoundingClientRect();
        this.setState({ rect });
      });
    }
  };
  render() {
    return (
      <>
        {this.props.htmlBook ? (
          <PopupMenu
            {...{
              rendition: this.props.htmlBook.rendition,
              rect: this.state.rect,
              chapterDocIndex: this.state.chapterDocIndex,
              chapter: this.state.chapter,
            }}
          />
        ) : null}
        {this.props.htmlBook ? (
          <PopupRefer
            {...{
              rendition: this.props.htmlBook.rendition,
              chapterDocIndex: this.state.chapterDocIndex,
            }}
          />
        ) : null}
        {this.props.isOpenMenu &&
        this.props.htmlBook &&
        (this.props.menuMode === "dict" ||
          this.props.menuMode === "trans" ||
          this.props.menuMode === "assistant" ||
          this.props.menuMode === "note") ? (
          <PopupBox
            {...{
              rendition: this.props.htmlBook.rendition,
              rect: this.state.rect,
              chapterDocIndex: this.state.chapterDocIndex,
              chapter: this.state.chapter,
            }}
          />
        ) : null}
        {this.props.htmlBook && this.props.currentBook.format !== "PDF" && (
          <ImageViewer
            {...{
              isShow: this.props.isShow,
              rendition: this.props.htmlBook.rendition,
              handleEnterReader: this.props.handleEnterReader,
              handleLeaveReader: this.props.handleLeaveReader,
            }}
          />
        )}
        <div
          className={
            this.props.readerMode === "scroll"
              ? "html-viewer-page scrolling-html-viewer-page"
              : "html-viewer-page"
          }
          id="page-area"
          style={
            this.props.readerMode === "scroll" &&
            document.body.clientWidth >= 570
              ? {
                  // marginLeft: this.state.pageOffset,
                  // marginRight: this.state.pageOffset,
                  paddingLeft: "0px",
                  paddingRight: "15px",
                  left: this.state.pageOffset,
                  width: this.state.pageWidth,
                }
              : {
                  left: this.state.pageOffset,
                  width: this.state.pageWidth,
                }
          }
        ></div>
        <PageWidget />
        {ConfigService.getReaderConfig("isHideBackground") ===
        "yes" ? null : this.props.currentBook.key ? (
          <Background />
        ) : null}
      </>
    );
  }
}
export default withRouter(Viewer as any);
