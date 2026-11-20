import { dropNoneSign, dropNoneSigns } from '../../../modules/traffic_sign/drop_none';


describe('traffic_sign/drop_none', () => {
    it('drops none once there is a sign', () => {
        expect(dropNoneSign('none;DE:"Gehwegschäden"')).toBe('DE:"Gehwegschäden"');
        expect(dropNoneSign('DE:239;none')).toBe('DE:239');
        expect(dropNoneSign('none')).toBe('none');
        expect(dropNoneSign('DE:239;1022-10')).toBe('DE:239;1022-10');
    });

    it('changes only traffic sign keys', () => {
        expect(dropNoneSigns({ 'traffic_sign:forward': 'none;DE:239', note: 'none;x', width: undefined }))
            .toEqual({ 'traffic_sign:forward': 'DE:239', note: 'none;x', width: undefined });
    });
});
