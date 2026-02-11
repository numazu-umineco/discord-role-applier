import { InteractionResponseType } from 'discord-interactions';

const EPHEMERAL_FLAG = 64;

export function deferredResponse(ephemeral: boolean = true) {
  return {
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: ephemeral ? EPHEMERAL_FLAG : 0,
    },
  };
}

export function immediateResponse(content: string, ephemeral: boolean = true) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      flags: ephemeral ? EPHEMERAL_FLAG : 0,
    },
  };
}

export function updateMessageResponse(content: string, components: any[] = []) {
  return {
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      content,
      components,
      flags: EPHEMERAL_FLAG,
    },
  };
}

export function deferredUpdateResponse() {
  return {
    type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
    data: {},
  };
}
