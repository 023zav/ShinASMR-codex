import i18next from "i18next";

export const initI18n = async () => {
  await i18next.init({
    lng: "en",
    fallbackLng: "en",
    resources: {
      en: {
        translation: {
          no_selection: "No selection",
          tap_hint: "Tap a train or station.",
          follow_train: "Follow train",
          enable_sound: "Enable sound",
          disable_sound: "Sound on",
          about: "About",
          support: "Support"
        }
      }
    }
  });
};

export const t = (key: string) => i18next.t(key);
