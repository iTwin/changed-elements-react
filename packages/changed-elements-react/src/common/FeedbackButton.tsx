/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SvgSmileyHappy } from "@itwin/itwinui-icons-react";
import { Button, Text } from "@itwin/itwinui-react";
import { IModelApp } from "@itwin/core-frontend";
import "./FeedbackButton.scss";


interface Props{
  /** Link for button to take you to.*/
  feedbackLink: string;
}

/** Feedback button that on click takes you to provided link.*/
export function FeedbackButton(props:Props){
  return (
    // eslint-disable-next-line react/jsx-no-target-blank
    <a href={props.feedbackLink} target="_blank">
      <Button styleType='high-visibility' className="button">
        <SvgSmileyHappy className="svg"></SvgSmileyHappy>
        <Text className="text">{IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompareLeaveFeedback")}</Text>
      </Button>
    </a>);
}
