import { ComboBox } from "@itwin/itwinui-react";
import React from "react";

export type ModeOptions = "enable" | "disable";

type ModeSelectorProps<T extends string> = {
  onChange: (value: React.SetStateAction<T>) => void;
  options: { label: string; value: T; }[];
  inputProps: { placeholder: string; };
};

export function ModeSelector<T extends string>(props: Readonly<ModeSelectorProps<T>>) {
  const options = React.useMemo(
    () => props.options,
    [props.options],
  );
  return (
    <ComboBox
      options={options}
      inputProps={props.inputProps}
      onChange={props.onChange}
    />
  );
}

export default ModeSelector;
