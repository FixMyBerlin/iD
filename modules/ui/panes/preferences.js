import { t } from '../../core/localizer';
import { uiPane } from '../pane';
import { uiSectionPrivacy } from '../sections/privacy';
import { uiSectionInterface } from '../sections/interface';
import { uiSectionPanels } from '../sections/panels';
import { uiSectionOsmServer } from '../sections/osm_server';
import { uiSectionFavoritePresets } from '../sections/favorite_presets';

export function uiPanePreferences(context) {

  const osm = context.connection();
  const apiConnections = osm && osm.apiConnections();

  let preferencesPane = uiPane('preferences', context)
    .key(t('preferences.key'))
    .label(t.append('preferences.title'))
    .description(t.append('preferences.description'))
    .iconName('fas-user-cog')
    .sections([
        uiSectionInterface(context),
        uiSectionPanels(context),
        uiSectionPrivacy(context)
    ].concat(
        // the live / dev switch, only when the build offers more than one OSM server
        apiConnections && apiConnections.length > 1 ? [uiSectionOsmServer(context)] : [],
        [uiSectionFavoritePresets(context)]
    ));

  return preferencesPane;
}
