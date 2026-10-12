// Validates review evidence, not the honesty or professional quality of its author.
export function directorReviewTemplate(report) {
 return {schemaVersion:1, videoSha256:report.artifacts.finalVideo.sha256, timelineSha256:report.directorContract.timelineSha256,
 reviewer:'', reviewedAt:'', fullVideoWatched:false, fullAudioListened:false, narrativeFinding:'', pacingFinding:'', openIssues:[],
 scenes:report.directorContract.sceneIds.map(sceneId=>({sceneId,passed:false,finding:''}))};
}
export function checkDirectorReview(review,report) {
 const issues=[];
 if(!review || review.schemaVersion!==1) return {passed:false,issues:['缺少导演审片记录']};
 if(review.videoSha256!==report.artifacts?.finalVideo?.sha256 || review.timelineSha256!==report.directorContract?.timelineSha256) issues.push('审片记录不属于当前视频/时间轴');
 if(!review.reviewer?.trim() || !Number.isFinite(Date.parse(review.reviewedAt))) issues.push('缺少审阅者或时间');
 if(review.fullVideoWatched!==true || review.fullAudioListened!==true) issues.push('完整观看/试听尚未完成');
 if(!review.narrativeFinding?.trim() || !review.pacingFinding?.trim()) issues.push('缺少全片叙事/节奏结论');
 if(!Array.isArray(review.openIssues) || review.openIssues.length) issues.push('仍有未解决问题');
 const rows=review.scenes || [],ids=report.directorContract?.sceneIds || [];
 if(rows.length!==ids.length || new Set(rows.map(r=>r.sceneId)).size!==ids.length || !ids.every(id=>rows.some(r=>r.sceneId===id&&r.passed===true&&r.finding?.trim()))) issues.push('逐镜解释效果尚未审完');
 return {passed:issues.length===0,issues};
}
