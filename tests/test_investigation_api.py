import time
from test_investigation import inv_env


def test_brief_run_trace_and_permissions(inv_env):
    client, _, tokens=inv_env
    viewer={'Authorization':'Bearer '+tokens['viewer']}
    analyst={'Authorization':'Bearer '+tokens['analyst']}
    brief=client.get('/v1/investigation/brief',headers=viewer)
    assert brief.status_code==200, brief.text
    board=brief.json(); assert board['scorecard']['scored']==3
    assert board['cases'] and board['cases'][0]['kind']=='revenue_drop'
    case_id=board['cases'][0]['id']
    denied=client.post(f'/v1/investigation/cases/{case_id}/decide',json={'option_key':'hold'},headers=viewer)
    assert denied.status_code==403
    first=client.post(f'/v1/investigation/cases/{case_id}/run',headers=analyst)
    second=client.post(f'/v1/investigation/cases/{case_id}/run',headers=analyst)
    assert first.status_code==200 and second.status_code==200
    for _ in range(100):
        trace=client.get(f'/v1/investigation/cases/{case_id}/trace',headers=viewer).json()
        if trace['run_state'] in {'done','failed'}: break
        time.sleep(.1)
    assert trace['run_state']=='done'
    assert sum(e['type']=='assign' for e in trace['events'])==7
    assert client.get(f'/v1/investigation/cases/{case_id}/trace',params={'after':trace['events'][-1]['seq']},headers=viewer).json()['events']==[]
