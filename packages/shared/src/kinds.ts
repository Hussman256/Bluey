/**
 * Nostr event kinds used across 1btc (client + index service).
 */
export const KIND = {
  // NIP-01 core
  Metadata: 0,
  Text: 1,
  RecommendRelay: 2,
  Contacts: 3, // NIP-02 follow list

  // engagement
  Repost: 6, // NIP-18
  Reaction: 7, // NIP-25
  GenericRepost: 16, // NIP-18
  Comment: 1111, // NIP-22 threaded comments

  // messaging
  SealedDM: 13, // NIP-17
  PrivateDM: 14, // NIP-17
  GiftWrap: 1059, // NIP-59

  // long-form (ZeroNotes)
  Article: 30023, // NIP-23
  ArticleDraft: 30024, // NIP-23
  Highlight: 9802, // NIP-84

  // lists / curation
  MuteList: 10000, // NIP-51
  PinList: 10001,
  BookmarkList: 10003,
  RelayList: 10002, // NIP-65
  BlossomServerList: 10063, // BUD-03
  CurationSet: 30004, // NIP-51 — a bootcamp curriculum
  CurationSetArticles: 30005,
  FollowSet: 30000,

  // groups / clubs — NIP-29
  GroupMetadata: 39000, // relay-generated: name/about/picture/flags
  GroupAdmins: 39001, // relay-generated: admin list + roles
  GroupMembers: 39002, // relay-generated: member list
  GroupRoles: 39003, // relay-generated: role definitions
  GroupChatMessage: 9, // member chat
  GroupChatReply: 10,
  GroupThread: 11, // member forum post
  GroupThreadReply: 1111,
  GroupAddUser: 9000, // admin: put-user (add member / set roles)
  GroupRemoveUser: 9001, // admin: remove member
  GroupEditMetadata: 9002, // admin: edit name/about/picture
  GroupDeleteEvent: 9005, // admin: delete a message
  GroupCreate: 9007, // create group (sender becomes admin)
  GroupDelete: 9008, // admin: delete group
  GroupJoinRequest: 9021,
  GroupLeaveRequest: 9022,

  // live — NIP-53
  LiveEvent: 30311,
  LiveChatMessage: 1311,

  // badges — NIP-58
  BadgeDefinition: 30009,
  BadgeAward: 8,
  ProfileBadges: 30008,

  // marketplace / opportunities — NIP-99
  ClassifiedListing: 30402,
  ClassifiedListingDraft: 30403,

  // value — NIP-57 zaps, NIP-75 goals
  ZapRequest: 9734,
  ZapReceipt: 9735,
  ZapGoal: 9041,

  // reporting — NIP-56
  Report: 1984,

  // app data
  AppSpecificData: 30078, // NIP-78
} as const;

export type Kind = (typeof KIND)[keyof typeof KIND];

/** `t` tag markers so 1btc can find its own content among generic Nostr kinds. */
export const TAG = {
  client: '1btc',
  bootcamp: '1btc:bootcamp',
  lesson: '1btc:lesson',
  liveClass: '1btc:live',
} as const;

/** Kinds the index service ingests from the relay firehose. */
export const INGEST_KINDS: number[] = [
  KIND.Metadata,
  KIND.Text,
  KIND.Contacts,
  KIND.Repost,
  KIND.Reaction,
  KIND.GenericRepost,
  KIND.Article,
  KIND.ZapReceipt,
  KIND.Report,
  KIND.RelayList,
];
