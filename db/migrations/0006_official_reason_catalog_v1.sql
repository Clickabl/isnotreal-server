BEGIN;

-- Canonical v1 reason catalog.
-- Codes describe documented, source-verifiable actions or authoritative-list status.
-- They are not ideological labels and do not imply unrecorded conduct.

INSERT INTO reason_definitions (code, label, description, category, default_list) VALUES
  ('P01', 'Publicly advocated for Palestinian rights', 'A documented public statement, interview, speech, post, or published work explicitly advocating Palestinian rights, freedom, equality, or self-determination.', 'person-positive', 'highlight'),
  ('P02', 'Publicly called for a Gaza ceasefire', 'A documented public call for a ceasefire or immediate cessation of hostilities in Gaza/Israel.', 'person-positive', 'highlight'),
  ('P03', 'Signed Artists4Ceasefire', 'Verified as a signatory of the Artists4Ceasefire letter or an official successor version of that campaign.', 'person-positive', 'highlight'),
  ('P04', 'Signed Film Workers for Palestine pledge', 'Verified as a signatory of the Film Workers for Palestine pledge or an official successor version.', 'person-positive', 'highlight'),
  ('P05', 'Joined No Music for Genocide', 'Verified participant in No Music for Genocide, including the campaign''s documented music geo-block/removal action.', 'person-positive', 'highlight'),
  ('P06', 'Boycotted Israeli institutions', 'Took a documented boycott or refusal action directed at an Israeli institution under stated Palestine-related criteria.', 'person-positive', 'highlight'),
  ('P07', 'Withdrew in Palestine solidarity', 'Withdrew from a performance, event, partnership, production, or other commitment and explicitly connected the withdrawal to Palestine solidarity or a related campaign.', 'person-positive', 'highlight'),
  ('P08', 'Participated in a Palestine solidarity event', 'Documented participation or performance at a Palestine solidarity rally, protest, benefit, teach-in, or advocacy event.', 'person-positive', 'highlight'),
  ('P09', 'Raised funds for Palestinian relief', 'Organized or materially promoted documented fundraising for Palestinian humanitarian relief.', 'person-positive', 'highlight'),
  ('P10', 'Donated to Palestinian relief', 'Made a documented personal donation or directed proceeds to Palestinian humanitarian relief.', 'person-positive', 'highlight'),
  ('P11', 'Released Palestine-focused creative work', 'Released music, film, writing, visual art, or another creative work explicitly addressing Palestine or Palestinian rights.', 'person-positive', 'highlight'),
  ('P12', 'Publicly criticized Israeli military actions', 'Made a documented public statement specifically criticizing Israeli military conduct or operations affecting Palestinians.', 'person-positive', 'highlight'),
  ('P13', 'Publicly opposed occupation or settlements', 'Made a documented public statement opposing Israeli occupation or settlement activity in occupied Palestinian territory.', 'person-positive', 'highlight'),
  ('P14', 'Took another documented Palestine solidarity action', 'A reviewed, source-backed Palestine solidarity action that does not fit a narrower positive reason code. Use only when a more specific code is unavailable.', 'person-positive', 'highlight'),

  ('I01', 'Publicly expressed support for Israel in the conflict', 'A documented public statement explicitly supporting Israel in the Israel-Palestine conflict. This code alone does not imply support for every Israeli government or military action.', 'person-negative', 'filter'),
  ('I02', 'Signed the October 2023 CCFP Israel letter', 'Verified as a signatory of Creative Community for Peace''s October 2023 entertainment-industry open letter supporting Israel, condemning Hamas, and calling for hostage release.', 'person-negative', 'filter'),
  ('I03', 'Publicly supported Israeli military action', 'Made a documented public statement explicitly supporting Israeli military action or operations affecting Gaza or Palestinians.', 'person-negative', 'filter'),
  ('I04', 'Raised funds for an IDF-related organization', 'Organized or materially promoted documented fundraising for the IDF or an organization providing material support to Israeli military personnel.', 'person-negative', 'filter'),
  ('I05', 'Donated to an IDF-related organization', 'Made a documented personal donation or directed proceeds to the IDF or an organization providing material support to Israeli military personnel.', 'person-negative', 'filter'),
  ('I06', 'Participated in an IDF support fundraiser or event', 'Documented participation in a fundraiser, benefit, or event whose stated purpose included supporting the IDF or Israeli military personnel.', 'person-negative', 'filter'),
  ('I07', 'Publicly encouraged support for the IDF', 'Made a documented public appeal encouraging financial, material, political, or other support for the IDF.', 'person-negative', 'filter'),
  ('I08', 'Performed at an IDF support event', 'Performed or appeared as featured talent at a documented event whose stated purpose included support for the IDF or Israeli military personnel.', 'person-negative', 'filter'),
  ('I09', 'Publicly opposed a Gaza ceasefire', 'Made a documented public statement opposing a proposed or general ceasefire in Gaza.', 'person-negative', 'filter'),
  ('I10', 'Publicly opposed a Palestine boycott or solidarity campaign', 'Made a documented public statement or took a documented advocacy action opposing a specific Palestine solidarity, boycott, divestment, or sanctions campaign.', 'person-negative', 'filter'),
  ('I11', 'Publicly defended Israeli government Gaza policy', 'Made a documented public statement explicitly defending an Israeli government policy or course of action in Gaza.', 'person-negative', 'filter'),
  ('I12', 'Publicly opposed Palestinian statehood or self-determination', 'Made a documented public statement opposing Palestinian statehood or Palestinian national self-determination.', 'person-negative', 'filter'),

  ('CP01', 'Publicly called for a Gaza ceasefire', 'The company or organization made an official public call for a ceasefire in Gaza.', 'company-positive', 'highlight'),
  ('CP02', 'Donated to Palestinian humanitarian relief', 'The company or organization made a documented donation of money, goods, services, or proceeds to Palestinian humanitarian relief.', 'company-positive', 'highlight'),
  ('CP03', 'Raised funds for Palestinian humanitarian relief', 'The company or organization organized or materially promoted documented fundraising for Palestinian humanitarian relief.', 'company-positive', 'highlight'),
  ('CP04', 'Ended a relevant Israeli military contract', 'The company or organization documented the termination or non-renewal of a contract providing relevant goods or services to the Israeli military.', 'company-positive', 'highlight'),
  ('CP05', 'Divested from a documented boycott or divestment target', 'The company or organization documented divestment from an entity targeted by a recognized Palestine-related boycott or divestment campaign.', 'company-positive', 'highlight'),
  ('CP06', 'Ended settlement-related business activity', 'The company or organization documented ending business activity connected to Israeli settlements in occupied Palestinian territory.', 'company-positive', 'highlight'),
  ('CP07', 'Joined a documented Palestine solidarity campaign', 'The company or organization officially joined or endorsed a named Palestine solidarity campaign or pledge.', 'company-positive', 'highlight'),
  ('CP08', 'Refuses business with Israeli settlements', 'The company or organization has a documented policy refusing relevant business with Israeli settlements in occupied Palestinian territory.', 'company-positive', 'highlight'),
  ('CP09', 'Participates in a documented Palestine-related boycott', 'The company or organization has taken a documented boycott action under stated Palestine-related criteria.', 'company-positive', 'highlight'),

  ('C01', 'Supplies weapons or military equipment to Israel', 'Documented supply of weapons, military platforms, munitions, or other military equipment to Israel or the Israeli military.', 'company-negative', 'filter'),
  ('C02', 'Supplies components used in Israeli military systems', 'Documented supply of components incorporated into Israeli military weapons, platforms, or systems.', 'company-negative', 'filter'),
  ('C03', 'Provides cloud, AI, or technology services to Israeli military', 'Documented provision of cloud computing, artificial intelligence, data, software, or other technology services to the Israeli military.', 'company-negative', 'filter'),
  ('C04', 'Provides surveillance or security technology used in occupied Palestinian territory', 'Documented provision of surveillance, biometric, policing, or security technology used in occupied Palestinian territory.', 'company-negative', 'filter'),
  ('C05', 'Provides infrastructure or services to Israeli military', 'Documented provision of infrastructure, logistics, communications, maintenance, professional services, or other non-weapons operational support to the Israeli military.', 'company-negative', 'filter'),
  ('C06', 'Donated goods or services to Israeli military personnel', 'Documented company or franchise donation of goods or services to Israeli military personnel.', 'company-negative', 'filter'),
  ('C07', 'Donated money to an IDF-related organization', 'Documented company donation of money or proceeds to the IDF or an organization providing material support to Israeli military personnel.', 'company-negative', 'filter'),
  ('C08', 'Fundraised for an IDF-related organization', 'Documented company fundraising for the IDF or an organization providing material support to Israeli military personnel.', 'company-negative', 'filter'),
  ('C09', 'Operates in Israeli settlements in occupied territory', 'Documented company operations, locations, production, or commercial activity in Israeli settlements in occupied Palestinian territory.', 'company-negative', 'filter'),
  ('C10', 'Provides services or infrastructure to Israeli settlements', 'Documented provision of services or infrastructure that supports Israeli settlements in occupied Palestinian territory.', 'company-negative', 'filter'),
  ('C11', 'Supplies settlement construction or expansion', 'Documented provision of construction, engineering, materials, equipment, or related services for Israeli settlement construction or expansion.', 'company-negative', 'filter'),
  ('C12', 'Extracts or uses resources from occupied Palestinian territory', 'Documented extraction, exploitation, or commercial use of natural resources from occupied Palestinian territory.', 'company-negative', 'filter'),
  ('C13', 'Listed in UN settlement-business database', 'The company is listed in the relevant United Nations database/report of business enterprises involved in specified settlement-related activities. The underlying UN entry is the evidence for this code.', 'company-negative', 'filter'),
  ('C14', 'BDS consumer boycott priority target', 'The Palestinian BDS National Committee currently identifies the company or brand as a consumer boycott priority target.', 'company-negative', 'filter'),
  ('C15', 'BDS pressure target', 'The Palestinian BDS National Committee currently identifies the company or brand as a pressure target.', 'company-negative', 'filter'),
  ('C16', 'BDS divestment or exclusion target', 'The Palestinian BDS National Committee currently identifies the company or brand as a divestment, exclusion, or institutional-pressure target.', 'company-negative', 'filter'),
  ('C17', 'Israeli military or security contractor', 'Documented direct contracting relationship to supply military or security goods or services to Israel or the Israeli military.', 'company-negative', 'filter'),
  ('C18', 'Israeli government contractor for relevant military or security activity', 'Documented Israeli government contract materially connected to military, policing, surveillance, detention, occupation, or related security activity.', 'company-negative', 'filter'),
  ('C19', 'Invests in companies supplying Israeli military', 'Documented direct investment exposure to companies supplying the Israeli military, under the project''s published investment-inclusion threshold and methodology.', 'company-negative', 'filter'),
  ('C20', 'Finances companies supplying Israeli military', 'Documented financing, underwriting, lending, or comparable financial support to companies supplying the Israeli military, under the project''s published finance-inclusion methodology.', 'company-negative', 'filter'),
  ('C21', 'Company officially supported Israeli military action', 'An official company statement explicitly supported Israeli military action or operations affecting Gaza or Palestinians.', 'company-negative', 'filter'),
  ('C22', 'Senior company leadership publicly supported Israeli military action', 'A documented statement by qualifying senior company leadership explicitly supported Israeli military action. This code identifies leadership conduct and must not be presented as a company statement.', 'company-negative', 'filter'),
  ('C23', 'Provided wartime material support to Israeli state or military', 'Documented wartime provision of material goods, services, facilities, or operational support to the Israeli state or military not captured by a narrower code.', 'company-negative', 'filter'),
  ('C24', 'Other documented settlement involvement', 'Reviewed, source-backed involvement in Israeli settlement activity in occupied Palestinian territory that does not fit a narrower settlement code. Use only when a more specific code is unavailable.', 'company-negative', 'filter')
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  default_list = EXCLUDED.default_list,
  active = true,
  updated_at = now();

COMMIT;
