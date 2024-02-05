/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SvgSmileyHappy } from "@itwin/itwinui-icons-react";
import { Button, Text } from "@itwin/itwinui-react";
import { IModelApp } from "@itwin/core-frontend";
import "./FeedbackButton.scss";


interface Props {
  /** Link for button to take you to.*/
  feedbackUrl: string;
}

/** Feedback button that on click takes you to provided link.*/
export function FeedbackButton(props: Props) {
  return (
    <Button as="a" href={props.feedbackUrl} target="_blank" rel="noreferrer" styleType='high-visibility' className="button">
      <SvgSmileyHappy className="svg"></SvgSmileyHappy>
      <Text className="text">{IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompareLeaveFeedback")}</Text>
    </Button>);
}
